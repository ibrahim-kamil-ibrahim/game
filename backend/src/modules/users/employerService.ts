import type { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/errors';
import { hashPassword } from '../../utils/auth';
import { getPagination, buildPageMeta, type Pagination } from '../../utils/pagination';
import { recordAudit } from '../../services/auditService';
import { startOfDay } from '../../utils/time';
import { decryptSecret, encryptSecret } from '../../utils/crypto';
import { generateTemporaryPassword, generateUsername } from '../../utils/credentials';
import { logger } from '../../utils/logger';
import type { Request } from 'express';

export interface EmployerListQuery extends Partial<Pagination> {
  search?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
}

function publicUser(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listEmployers(businessId: string, query: EmployerListQuery) {
  const pagination = getPagination(query);
  const where = {
    businessId,
    role: 'EMPLOYER' as const,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' as const } },
            { username: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { timezone: true },
  });

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);

  const ids = users.map((user) => user.id);
  const [sessionCounts, revenue, todayRevenue] = await Promise.all([
    prisma.gameSession.groupBy({
      by: ['employerId'],
      where: { employerId: { in: ids }, status: { in: ['COMPLETED', 'EXPIRED', 'ACTIVE', 'PAUSED'] } },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ['employerId'],
      where: { employerId: { in: ids }, status: 'PAID' },
      _sum: { amountSantim: true },
    }),
    prisma.payment.groupBy({
      by: ['employerId'],
      where: {
        employerId: { in: ids },
        status: 'PAID',
        paidAt: { gte: startOfDay(new Date(), business.timezone) },
      },
      _sum: { amountSantim: true },
    }),
  ]);

  const sessionMap = new Map(sessionCounts.map((row) => [row.employerId, row._count._all]));
  const revenueMap = new Map(revenue.map((row) => [row.employerId, row._sum.amountSantim ?? 0]));
  const todayMap = new Map(todayRevenue.map((row) => [row.employerId, row._sum.amountSantim ?? 0]));

  return {
    items: users.map((user) => ({
      ...publicUser(user),
      sessionsCount: sessionMap.get(user.id) ?? 0,
      totalRevenueSantim: revenueMap.get(user.id) ?? 0,
      todayRevenueSantim: todayMap.get(user.id) ?? 0,
    })),
    meta: buildPageMeta(total, pagination),
  };
}

export async function getEmployer(businessId: string, id: string) {
  const user = await prisma.user.findFirst({
    where: { id, businessId, role: 'EMPLOYER', deletedAt: null },
  });
  if (!user) throw AppError.notFound('Employer', 'EMPLOYER_NOT_FOUND');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { timezone: true },
  });
  const todayStart = startOfDay(new Date(), business.timezone);

  let temporaryPassword: string | null = null;
  if (user.initialPasswordEncrypted) {
    try {
      temporaryPassword = decryptSecret(user.initialPasswordEncrypted);
    } catch (error) {
      logger.warn('Failed to decrypt employer temporary password', { userId: user.id, error: String(error) });
    }
  }

  const [sessionsTotal, sessionsToday, activeSessions, revenueTotal, revenueToday, recentSessions, recentPayments] =
    await Promise.all([
      prisma.gameSession.count({ where: { employerId: id } }),
      prisma.gameSession.count({ where: { employerId: id, startedAt: { gte: todayStart } } }),
      prisma.gameSession.count({ where: { employerId: id, status: { in: ['ACTIVE', 'PAUSED'] } } }),
      prisma.payment.aggregate({ where: { employerId: id, status: 'PAID' }, _sum: { amountSantim: true } }),
      prisma.payment.aggregate({
        where: { employerId: id, status: 'PAID', paidAt: { gte: todayStart } },
        _sum: { amountSantim: true },
      }),
      prisma.gameSession.findMany({
        where: { employerId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          machine: { select: { id: true, name: true, code: true } },
          payment: { select: { transactionRef: true, amountSantim: true, status: true } },
        },
      }),
      prisma.payment.findMany({
        where: { employerId: id },
        orderBy: { paidAt: 'desc' },
        take: 10,
        include: { machine: { select: { id: true, name: true, code: true } } },
      }),
    ]);

  return {
    employer: publicUser(user),
    credentials: {
      username: user.username,
      temporaryPassword,
      setAt: user.initialPasswordSetAt,
    },
    stats: {
      sessionsTotal,
      sessionsToday,
      activeSessions,
      revenueTotalSantim: revenueTotal._sum.amountSantim ?? 0,
      revenueTodaySantim: revenueToday._sum.amountSantim ?? 0,
    },
    recentSessions,
    recentPayments,
  };
}

export interface CreateEmployerInput {
  fullName: string;
  username?: string;
  phone?: string;
  password?: string;
}

export interface CreatedEmployer extends ReturnType<typeof publicUser> {
  temporaryPassword: string;
}

export async function createEmployer(
  businessId: string,
  input: CreateEmployerInput,
  actorId: string,
  req: Request,
): Promise<CreatedEmployer> {
  const fullName = input.fullName.trim();
  let username = input.username?.trim().toLowerCase();

  if (!username) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = generateUsername(fullName);
      const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
      if (!taken) {
        username = candidate;
        break;
      }
    }
    if (!username) {
      throw AppError.conflict('Could not generate a unique username. Please try again.', 'USERNAME_GENERATION_FAILED');
    }
  } else {
    const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (existing) throw AppError.conflict('That username is already taken', 'USERNAME_TAKEN');
  }

  const temporaryPassword = input.password?.trim() || generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      businessId,
      role: 'EMPLOYER',
      fullName,
      username,
      phone: input.phone?.trim() || null,
      passwordHash,
      status: 'ACTIVE',
      initialPasswordEncrypted: encryptSecret(temporaryPassword),
      initialPasswordSetAt: now,
    },
  });

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: 'EMPLOYER_CREATED',
    entityType: 'User',
    entityId: user.id,
    after: { fullName: user.fullName, username: user.username, phone: user.phone },
    req,
  });

  return { ...publicUser(user), temporaryPassword };
}

export interface UpdateEmployerInput {
  fullName?: string;
  username?: string;
  phone?: string | null;
}

export async function updateEmployer(
  businessId: string,
  id: string,
  input: UpdateEmployerInput,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.user.findFirst({
    where: { id, businessId, role: 'EMPLOYER', deletedAt: null },
  });
  if (!existing) throw AppError.notFound('Employer', 'EMPLOYER_NOT_FOUND');

  if (input.username && input.username.trim().toLowerCase() !== existing.username) {
    const taken = await prisma.user.findUnique({ where: { username: input.username.trim().toLowerCase() } });
    if (taken) throw AppError.conflict('That username is already taken', 'USERNAME_TAKEN');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
      ...(input.username !== undefined ? { username: input.username.trim().toLowerCase() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    },
  });

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: 'EMPLOYER_UPDATED',
    entityType: 'User',
    entityId: id,
    before: { fullName: existing.fullName, username: existing.username, phone: existing.phone },
    after: { fullName: updated.fullName, username: updated.username, phone: updated.phone },
    req,
  });

  return publicUser(updated);
}

export async function setEmployerStatus(
  businessId: string,
  id: string,
  status: 'ACTIVE' | 'SUSPENDED',
  actorId: string,
  req: Request,
) {
  const existing = await prisma.user.findFirst({
    where: { id, businessId, role: 'EMPLOYER', deletedAt: null },
  });
  if (!existing) throw AppError.notFound('Employer', 'EMPLOYER_NOT_FOUND');

  const updated = await prisma.user.update({ where: { id }, data: { status } });

  if (status === 'SUSPENDED') {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: status === 'SUSPENDED' ? 'EMPLOYER_SUSPENDED' : 'EMPLOYER_ACTIVATED',
    entityType: 'User',
    entityId: id,
    before: { status: existing.status },
    after: { status },
    req,
  });

  const { emitToAdmins, getSocketServer } = await import('../../sockets');
  if (status === 'SUSPENDED') {
    // Close any live socket sessions immediately; access tokens are already
    // rejected by the HTTP middleware.
    getSocketServer()?.in(`user:${id}`).disconnectSockets(true);
  }
  emitToAdmins(businessId, 'employer:activity', {
    employerId: id,
    fullName: updated.fullName,
    action: status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVATED',
    at: new Date().toISOString(),
  });

  return publicUser(updated);
}

export async function resetEmployerPassword(
  businessId: string,
  id: string,
  newPassword: string | undefined,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.user.findFirst({
    where: { id, businessId, role: 'EMPLOYER', deletedAt: null },
  });
  if (!existing) throw AppError.notFound('Employer', 'EMPLOYER_NOT_FOUND');

  const temporaryPassword = newPassword?.trim() || generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const setAt = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        initialPasswordEncrypted: encryptSecret(temporaryPassword),
        initialPasswordSetAt: setAt,
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  await recordAudit(prisma, {
    businessId,
    userId: actorId,
    actorRole: 'ADMIN',
    action: 'EMPLOYER_PASSWORD_RESET',
    entityType: 'User',
    entityId: id,
    req,
  });

  return {
    message: 'Password reset. Share the temporary password with the employer.',
    username: existing.username,
    temporaryPassword,
    setAt,
  };
}

export async function getEmployerActivity(businessId: string, id: string, query: { page?: number; pageSize?: number }) {
  const employer = await prisma.user.findFirst({
    where: { id, businessId, role: 'EMPLOYER', deletedAt: null },
    select: { id: true, fullName: true, username: true, status: true, lastLoginAt: true },
  });
  if (!employer) throw AppError.notFound('Employer', 'EMPLOYER_NOT_FOUND');

  const pagination = getPagination(query);

  const [sessions, sessionsTotal, payments, paymentsTotal, auditLogs] = await Promise.all([
    prisma.gameSession.findMany({
      where: { employerId: id },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        machine: { select: { name: true, code: true } },
        payment: { select: { transactionRef: true, amountSantim: true, status: true } },
      },
    }),
    prisma.gameSession.count({ where: { employerId: id } }),
    prisma.payment.findMany({
      where: { employerId: id },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      include: { machine: { select: { name: true, code: true } } },
    }),
    prisma.payment.count({ where: { employerId: id } }),
    prisma.auditLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
  ]);

  return {
    employer,
    sessions: { items: sessions, meta: buildPageMeta(sessionsTotal, pagination) },
    payments: { items: payments, meta: buildPageMeta(paymentsTotal, pagination) },
    auditLogs,
  };
}

export async function deleteEmployer(businessId: string, id: string, actorId: string, req: Request) {
  const existing = await prisma.user.findFirst({
    where: { id, businessId, role: 'EMPLOYER', deletedAt: null },
  });
  if (!existing) throw AppError.notFound('Employer', 'EMPLOYER_NOT_FOUND');

  const activeSessionCount = await prisma.gameSession.count({
    where: { employerId: id, status: { in: ['CREATED', 'ACTIVE', 'PAUSED'] } },
  });
  if (activeSessionCount > 0) {
    throw AppError.conflict(
      'This employer has active game sessions. End or cancel them before deleting.',
      'EMPLOYER_HAS_ACTIVE_SESSION',
    );
  }

  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        status: 'SUSPENDED',
        deletedAt,
        initialPasswordEncrypted: null,
        initialPasswordSetAt: null,
      },
    });
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: deletedAt },
    });
    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'EMPLOYER_DELETED',
      entityType: 'User',
      entityId: id,
      before: { username: existing.username, status: existing.status },
      after: { deletedAt },
      req,
    });
  });

  return { deleted: true };
}
