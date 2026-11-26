import type { BusinessSettings, User } from '@prisma/client';
import { prisma } from '../../config/database';
import { config } from '../../config/env';
import { AppError } from '../../utils/errors';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  newUuid,
  signAccessToken,
  verifyPassword,
} from '../../utils/auth';
import { recordAudit, requestMeta } from '../../services/auditService';
import { encryptSecret } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import type { Request } from 'express';

export interface AuthUserDto {
  id: string;
  fullName: string;
  username: string;
  role: 'ADMIN' | 'EMPLOYER';
  phone: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  business: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  };
  settings: BusinessSettings | null;
}

export function toAuthUserDto(
  user: User,
  business: { id: string; name: string; currency: string; timezone: string },
  settings: BusinessSettings | null,
): AuthUserDto {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role as 'ADMIN' | 'EMPLOYER',
    phone: user.phone,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    business,
    settings,
  };
}

async function issueRefreshToken(
  userId: string,
  familyId: string,
  meta: { ip?: string | null; userAgent?: string | null },
) {
  const token = generateOpaqueToken();
  const record = await prisma.refreshToken.create({
    data: {
      id: newUuid(),
      userId,
      tokenHash: hashOpaqueToken(token),
      familyId,
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
      createdByIp: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return { token, record };
}

export interface LoginResult {
  user: AuthUserDto;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export async function login(
  usernameInput: string,
  password: string,
  req: Request,
): Promise<LoginResult> {
  const username = usernameInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      business: { include: { settings: true } },
    },
  });

  if (!user || user.deletedAt) {
    throw AppError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordAudit(prisma, {
      businessId: user.businessId,
      userId: user.id,
      actorRole: user.role,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      req,
      after: { reason: 'INVALID_PASSWORD' },
    });
    throw AppError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');
  }

  if (user.status !== 'ACTIVE') {
    await recordAudit(prisma, {
      businessId: user.businessId,
      userId: user.id,
      actorRole: user.role,
      action: 'LOGIN_BLOCKED',
      entityType: 'User',
      entityId: user.id,
      req,
      after: { reason: 'ACCOUNT_SUSPENDED' },
    });
    throw AppError.forbidden(
      'This account is suspended. Please contact your administrator.',
      'ACCOUNT_SUSPENDED',
    );
  }

  const meta = requestMeta(req);
  const familyId = newUuid();
  const { token: refreshToken, record } = await issueRefreshToken(user.id, familyId, meta);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  await recordAudit(prisma, {
    businessId: user.businessId,
    userId: user.id,
    actorRole: user.role,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    req,
  });

  // Login activity is visible to admins in real time.
  const { emitToAdmins } = await import('../../sockets');
  if (user.role === 'EMPLOYER') {
    emitToAdmins(user.businessId, 'employer:activity', {
      employerId: user.id,
      fullName: user.fullName,
      action: 'LOGIN',
      at: new Date().toISOString(),
    });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    businessId: user.businessId,
    role: user.role,
    username: user.username,
  });

  return {
    user: toAuthUserDto(user, user.business, user.business.settings),
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: record.expiresAt,
  };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthUserDto;
}

export async function rotateRefreshToken(token: string, req: Request): Promise<RefreshResult> {
  const tokenHash = hashOpaqueToken(token);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { business: { include: { settings: true } } } } },
  });

  if (!existing) {
    throw AppError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const user = existing.user;
  if (user.deletedAt || user.status !== 'ACTIVE') {
    throw AppError.forbidden('This account is no longer active', 'ACCOUNT_SUSPENDED');
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw AppError.unauthorized('Session expired. Please sign in again.', 'REFRESH_TOKEN_EXPIRED');
  }

  const meta = requestMeta(req);
  const graceMs = config.jwt.refreshReuseGraceSeconds * 1000;

  if (existing.revokedAt) {
    const ageMs = Date.now() - existing.revokedAt.getTime();
    if (ageMs > graceMs) {
      // Token reuse outside the grace window means the token may have been
      // stolen: revoke the whole family and force a fresh login.
      await prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      logger.warn('Refresh token reuse detected', { userId: existing.userId, familyId: existing.familyId });
      throw AppError.unauthorized(
        'Refresh token has already been used. Please sign in again.',
        'REFRESH_TOKEN_REUSED',
      );
    }

    // Grace window: a response may have been lost while rotating (mobile network
    // switches, page reloads). Revoke any active token in the family and issue a
    // replacement so the user is not logged out by a transient failure.
    const newToken = generateOpaqueToken();
    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(newToken),
          familyId: existing.familyId,
          expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
          createdByIp: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      }),
    ]);

    return {
      accessToken: signAccessToken({
        sub: user.id,
        businessId: user.businessId,
        role: user.role,
        username: user.username,
      }),
      refreshToken: newToken,
      refreshTokenExpiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
      user: toAuthUserDto(user, user.business, user.business.settings),
    };
  }

  const newToken = generateOpaqueToken();
  const newId = newUuid();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: newId },
    }),
    prisma.refreshToken.create({
      data: {
        id: newId,
        userId: user.id,
        tokenHash: hashOpaqueToken(newToken),
        familyId: existing.familyId,
        expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
        createdByIp: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: user.id,
    businessId: user.businessId,
    role: user.role,
    username: user.username,
  });

  return {
    accessToken,
    refreshToken: newToken,
    refreshTokenExpiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
    user: toAuthUserDto(user, user.business, user.business.settings),
  };
}

export async function logout(token?: string, userId?: string) {
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else if (userId) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export async function getCurrentUser(userId: string): Promise<AuthUserDto> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { business: { include: { settings: true } } },
  });
  if (!user) throw AppError.unauthorized('Account no longer exists');
  return toAuthUserDto(user, user.business, user.business.settings);
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  req: Request,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User');
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw AppError.badRequest('Current password is incorrect', undefined, 'INVALID_PASSWORD');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        ...(user.role === 'EMPLOYER'
          ? {
              initialPasswordEncrypted: encryptSecret(newPassword),
              initialPasswordSetAt: new Date(),
            }
          : {
              initialPasswordEncrypted: null,
              initialPasswordSetAt: null,
            }),
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit(prisma, {
    businessId: user.businessId,
    userId,
    actorRole: user.role,
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: userId,
    req,
  });
}
