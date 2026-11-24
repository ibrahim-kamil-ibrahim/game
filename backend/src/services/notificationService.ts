import type { NotificationType, Prisma, Role } from '@prisma/client';
import { prisma, type TransactionClient } from '../config/database';
import { emitToAdmins, emitToUser } from '../sockets';

export interface NotificationInput {
  businessId: string;
  userId?: string | null;
  audience?: Role | null;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Persists a notification and pushes it to connected clients. Callers pass the
 * current transaction so the notification is only delivered if the business
 * operation commits.
 */
export async function createNotification(
  client: TransactionClient | typeof prisma,
  input: NotificationInput,
) {
  const notification = await client.notification.create({
    data: {
      businessId: input.businessId,
      userId: input.userId ?? null,
      audience: input.audience ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
    },
  });

  const payload = {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    createdAt: notification.createdAt,
  };

  if (input.userId) {
    emitToUser(input.userId, 'notification:new', payload);
  } else if (input.audience === 'ADMIN') {
    emitToAdmins(input.businessId, 'notification:new', payload);
  }

  return notification;
}

export function notifyAdmins(
  client: TransactionClient | typeof prisma,
  input: Omit<NotificationInput, 'userId' | 'audience'>,
) {
  return createNotification(client, { ...input, audience: 'ADMIN', userId: null });
}
