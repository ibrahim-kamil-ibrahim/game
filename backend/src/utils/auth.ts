import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config/env';
import { AppError } from './errors';

export interface AccessTokenPayload {
  sub: string;
  businessId: string;
  role: Role;
  username: string;
  type: 'access';
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, config.jwt.accessSecret, {
    expiresIn: `${config.jwt.accessTtlMinutes}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
    if (decoded.type !== 'access' || !decoded.sub) {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch {
    throw AppError.unauthorized('Invalid or expired access token', 'INVALID_TOKEN');
  }
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHmac('sha256', config.jwt.refreshSecret).update(token).digest('hex');
}

export function newUuid(): string {
  return crypto.randomUUID();
}
