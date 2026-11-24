import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { verifyAccessToken } from '../utils/auth';

/**
 * Authenticates a bearer access token and re-checks the user in the database so
 * that suspensions, deletions and role changes take effect immediately.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, businessId: true, role: true, username: true, fullName: true, status: true },
    });

    if (!user) throw AppError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND');
    if (user.status !== 'ACTIVE') {
      throw AppError.forbidden('This account is suspended. Contact your administrator.', 'ACCOUNT_SUSPENDED');
    }

    req.user = {
      id: user.id,
      businessId: user.businessId,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
    };
    next();
  } catch (error) {
    next(error);
  }
}

/** Restricts a route to the given roles. Must run after `authenticate`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('Your role is not allowed to perform this action'));
    }
    return next();
  };
}

export const adminOnly = [authenticate, requireRole('ADMIN')];
export const anyAuthenticated = [authenticate];
