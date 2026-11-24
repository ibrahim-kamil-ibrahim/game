import type { Prisma, Role } from '@prisma/client';
import type { Request } from 'express';
import { prisma, type TransactionClient } from '../config/database';

export interface AuditInput {
  businessId: string;
  userId?: string | null;
  actorRole?: Role | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function requestMeta(req?: Request) {
  if (!req) return { ip: null, userAgent: null };
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.socket?.remoteAddress ??
    null;
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
  return { ip, userAgent };
}

/**
 * Appends an immutable audit record. Accepts a transaction client so the audit
 * entry is committed atomically with the business change it describes.
 */
export async function recordAudit(
  client: TransactionClient | typeof prisma,
  input: AuditInput,
): Promise<void> {
  const meta = requestMeta(input.req);
  try {
    await client.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: toJson(input.before),
        after: toJson(input.after),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  } catch {
    // Audit logging must never break the primary business operation, but the
    // failure is still surfaced to the application log by the caller if needed.
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log', { action: input.action, entityType: input.entityType });
  }
}
