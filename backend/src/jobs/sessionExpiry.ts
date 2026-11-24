import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { remainingSeconds } from '../utils/time';
import { createNotification } from '../services/notificationService';
import { recordAudit } from '../services/auditService';
import { emitToAdmins, emitToBusiness, emitToUser } from '../sockets';
import { presentSession, sessionInclude } from '../services/sessionService';
import { logger } from '../utils/logger';

export interface ExpiryResult {
  expired: number;
  sessionIds: string[];
}

/**
 * Finds sessions whose server-side end timestamp has passed and completes them
 * atomically. Runs independently of the mobile app, so sessions always finish
 * even if the employer's phone is offline or the app is closed.
 */
export async function expireDueSessions(now = new Date(), limit = 50): Promise<ExpiryResult> {
  const due = await prisma.gameSession.findMany({
    where: { status: 'ACTIVE', endsAt: { lte: now } },
    select: { id: true },
    orderBy: { endsAt: 'asc' },
    take: limit,
  });

  const sessionIds: string[] = [];

  for (const candidate of due) {
    try {
      const expired = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            businessId: string;
            machineId: string;
            employerId: string;
            status: string;
            startedAt: Date | null;
            endsAt: Date | null;
            totalPausedSeconds: number;
            packageNameSnapshot: string;
            machineName: string;
          }>
        >(Prisma.sql`
          SELECT s.id, s."businessId", s."machineId", s."employerId", s.status, s."startedAt", s."endsAt",
                 s."totalPausedSeconds", s."packageNameSnapshot", m.name AS "machineName"
          FROM "GameSession" s JOIN "GameMachine" m ON m.id = s."machineId"
          WHERE s.id = ${candidate.id}::uuid FOR UPDATE OF s
        `);

        const session = rows[0];
        if (!session || session.status !== 'ACTIVE' || !session.endsAt || session.endsAt > now) {
          return null;
        }

        const actualDurationSeconds = session.startedAt
          ? Math.max(
              0,
              Math.floor((session.endsAt.getTime() - session.startedAt.getTime()) / 1000) -
                session.totalPausedSeconds,
            )
          : null;

        const updated = await tx.gameSession.update({
          where: { id: session.id },
          data: {
            status: 'EXPIRED',
            actualEndedAt: session.endsAt,
            actualDurationSeconds,
            pausedAt: null,
            events: {
              create: {
                type: 'EXPIRED',
                metadata: { expiredAt: session.endsAt, actualDurationSeconds },
              },
            },
          },
          include: sessionInclude,
        });

        await tx.gameMachine.updateMany({
          where: { id: session.machineId, status: 'IN_USE' },
          data: { status: 'AVAILABLE' },
        });

        await createNotification(tx, {
          businessId: session.businessId,
          userId: session.employerId,
          type: 'SESSION_EXPIRED',
          title: 'Session expired',
          body: `${session.packageNameSnapshot} on ${session.machineName} has ended.`,
          data: { sessionId: session.id, machineId: session.machineId },
        });
        await createNotification(tx, {
          businessId: session.businessId,
          audience: 'ADMIN',
          type: 'SESSION_EXPIRED',
          title: 'Session expired',
          body: `${session.packageNameSnapshot} on ${session.machineName} expired and the machine is available.`,
          data: { sessionId: session.id, machineId: session.machineId },
        });

        await recordAudit(tx, {
          businessId: session.businessId,
          action: 'SESSION_EXPIRED',
          entityType: 'GameSession',
          entityId: session.id,
          before: { status: 'ACTIVE', endsAt: session.endsAt },
          after: { status: 'EXPIRED', machineReleased: true },
        });

        return updated;
      });

      if (expired) {
        sessionIds.push(expired.id);
        const dto = presentSession(expired, now);
        emitToBusiness(expired.businessId, 'session:expired', dto);
        emitToAdmins(expired.businessId, 'session:expired', dto);
        emitToUser(expired.employerId, 'session:expired', dto);
        emitToBusiness(expired.businessId, 'machine:status', {
          machineId: expired.machineId,
          status: 'AVAILABLE',
        });
      }
    } catch (error) {
      logger.error('Failed to expire session', { sessionId: candidate.id, error: String(error) });
    }
  }

  if (sessionIds.length > 0) {
    logger.info('Expired sessions processed', { count: sessionIds.length });
  }
  return { expired: sessionIds.length, sessionIds };
}

/**
 * Sends "time is running out" notifications at the configured warning threshold
 * and at one minute remaining. Notifications are de-duplicated in the database.
 */
export async function dispatchExpiryWarnings(now = new Date()): Promise<number> {
  const sessions = await prisma.gameSession.findMany({
    where: {
      status: 'ACTIVE',
      endsAt: { gt: now, lte: new Date(now.getTime() + 60 * 60 * 1000) },
    },
    include: {
      machine: { select: { name: true } },
      business: { include: { settings: true } },
    },
    take: 200,
  });

  let sent = 0;

  for (const session of sessions) {
    if (!session.endsAt) continue;
    const secondsLeft = remainingSeconds(session.endsAt, now);
    if (secondsLeft <= 0) continue;
    if (!session.business.settings) continue;

    const warningMinutes = session.business.settings.expiryWarningMinutes;
    const thresholds = new Set<number>();
    if (warningMinutes > 1) thresholds.add(warningMinutes);
    thresholds.add(1);

    for (const threshold of thresholds) {
      if (secondsLeft > threshold * 60) continue;

      try {
        const exists = await prisma.notification.findFirst({
          where: {
            businessId: session.businessId,
            type: 'SESSION_EXPIRING',
            userId: session.employerId,
            AND: [
              { data: { path: ['sessionId'], equals: session.id } },
              { data: { path: ['threshold'], equals: threshold } },
            ],
          },
          select: { id: true },
        });
        if (exists) continue;

        const notification = await createNotification(prisma, {
          businessId: session.businessId,
          userId: session.employerId,
          type: 'SESSION_EXPIRING',
          title: `${threshold} minute${threshold === 1 ? '' : 's'} remaining`,
          body: `${session.packageNameSnapshot} on ${session.machine.name} ends in ${threshold} minute${
            threshold === 1 ? '' : 's'
          }.`,
          data: {
            sessionId: session.id,
            machineId: session.machineId,
            threshold,
            endsAt: session.endsAt.toISOString(),
          },
        });

        emitToUser(session.employerId, 'notification:new', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data,
          createdAt: notification.createdAt,
        });
        emitToUser(session.employerId, 'session:warning', {
          sessionId: session.id,
          threshold,
          remainingSeconds: secondsLeft,
        });
        sent += 1;
      } catch (error) {
        logger.warn('Failed to send expiry warning', { sessionId: session.id, error: String(error) });
      }
    }
  }

  return sent;
}
