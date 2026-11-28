import { Prisma, type Role } from '@prisma/client';
import { prisma, type TransactionClient } from '../config/database';
import { AppError } from '../utils/errors';
import { addMinutes, remainingSeconds } from '../utils/time';
import { emitToAdmins, emitToBusiness, emitToUser } from '../sockets';
import { createNotification } from './notificationService';
import { recordAudit } from './auditService';
import { requireApplicablePackage } from './packageService';
import { requireValidMachineQr } from './qrService';
import { transactionReference } from '../utils/money';
import { newUuid } from '../utils/auth';

export const sessionInclude = Prisma.validator<Prisma.GameSessionInclude>()({
  machine: {
    select: {
      id: true,
      name: true,
      code: true,
      imageUrl: true,
      status: true,
      location: true,
      category: { select: { id: true, name: true } },
    },
  },
  employer: { select: { id: true, fullName: true, username: true } },
  payment: {
    select: {
      id: true,
      transactionRef: true,
      status: true,
      amountSantim: true,
      currency: true,
      method: true,
      paidAt: true,
      type: true,
    },
  },
  extensions: {
    orderBy: { createdAt: 'asc' },
    include: {
      payment: { select: { transactionRef: true, status: true, amountSantim: true } },
      createdBy: { select: { id: true, fullName: true, username: true } },
    },
  },
});

export type SessionWithRelations = Prisma.GameSessionGetPayload<{ include: typeof sessionInclude }>;

/** Builds the canonical API representation of a session (timers computed server-side). */
export function presentSession(session: SessionWithRelations, now = new Date()) {
  let remaining = 0;
  let elapsed = 0;

  if (session.status === 'ACTIVE' && session.startedAt && session.endsAt) {
    remaining = remainingSeconds(session.endsAt, now);
    elapsed = Math.max(
      0,
      Math.floor((now.getTime() - session.startedAt.getTime()) / 1000) - session.totalPausedSeconds,
    );
  } else if (session.status === 'PAUSED' && session.startedAt && session.endsAt && session.pausedAt) {
    remaining = remainingSeconds(session.endsAt, session.pausedAt);
    elapsed = Math.max(
      0,
      Math.floor((session.pausedAt.getTime() - session.startedAt.getTime()) / 1000) -
        session.totalPausedSeconds,
    );
  } else if (session.actualDurationSeconds !== null) {
    elapsed = session.actualDurationSeconds;
  } else if (session.startedAt && session.endsAt) {
    elapsed = Math.max(0, Math.floor((session.endsAt.getTime() - session.startedAt.getTime()) / 1000));
  }

  return {
    id: session.id,
    status: session.status,
    machine: session.machine,
    employer: session.employer,
    packageId: session.packageId,
    packageName: session.packageNameSnapshot,
    durationMinutes: session.durationMinutesSnapshot,
    priceSantim: session.priceSantim,
    currency: 'ETB',
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    pausedAt: session.pausedAt,
    totalPausedSeconds: session.totalPausedSeconds,
    remainingSeconds: remaining,
    elapsedSeconds: elapsed,
    actualEndedAt: session.actualEndedAt,
    actualDurationSeconds: session.actualDurationSeconds,
    endReason: session.endReason,
    endedByRole: session.endedByRole,
    extensions: session.extensions.map((extension) => ({
      id: extension.id,
      packageName: extension.packageNameSnapshot,
      durationMinutes: extension.durationMinutes,
      priceSantim: extension.priceSantim,
      previousEndsAt: extension.previousEndsAt,
      newEndsAt: extension.newEndsAt,
      createdAt: extension.createdAt,
      paymentRef: extension.payment.transactionRef,
      createdBy: extension.createdBy,
    })),
    payment: session.payment,
    createdAt: session.createdAt,
  };
}

interface Actor {
  id: string;
  role: Role;
}

export interface StartSessionInput {
  businessId: string;
  actor: Actor;
  paymentId: string;
  qrToken?: string;
}

type StartOutcome =
  | { kind: 'ok'; session: SessionWithRelations; created: boolean }
  | { kind: 'busy'; paymentRef: string; machineName: string; reason: 'IN_USE' | 'MAINTENANCE' | 'INACTIVE' };

/**
 * Starts a game session for a previously paid cash payment. The whole operation
 * is serialized on the machine row, so two employers can never start the same
 * machine at the same time. A partial unique index provides a database-level
 * guarantee as a second line of defence.
 */
export async function startSession(input: StartSessionInput): Promise<SessionWithRelations> {
  const outcome = await prisma.$transaction(async (tx) => {
    const payments = await tx.$queryRaw<
      Array<{
        id: string;
        businessId: string;
        employerId: string;
        machineId: string;
        status: string;
        type: string;
        transactionRef: string;
        durationMinutesSnapshot: number;
        packageNameSnapshot: string;
        priceSantim: number;
        packageId: string | null;
      }>
    >(Prisma.sql`
      SELECT id, "businessId", "employerId", "machineId", status, type, "transactionRef",
             "durationMinutesSnapshot", "packageNameSnapshot", "amountSantim" AS "priceSantim", "packageId"
      FROM "Payment" WHERE id = ${input.paymentId}::uuid FOR UPDATE
    `);

    const payment = payments[0];
    if (!payment || payment.businessId !== input.businessId) {
      throw AppError.notFound('Payment', 'PAYMENT_NOT_FOUND');
    }
    if (input.actor.role !== 'ADMIN' && payment.employerId !== input.actor.id) {
      throw AppError.forbidden('You can only start sessions for your own payments');
    }
    if (payment.type !== 'RENTAL') {
      throw AppError.badRequest('This payment is not a rental payment', undefined, 'INVALID_PAYMENT_TYPE');
    }
    if (payment.status !== 'PAID') {
      throw AppError.conflict(
        `Payment cannot be used to start a session (status: ${payment.status})`,
        'PAYMENT_NOT_USABLE',
        { status: payment.status },
      );
    }

    const existing = await tx.gameSession.findUnique({
      where: { paymentId: payment.id },
      include: sessionInclude,
    });
    if (existing) return { kind: 'ok', session: existing, created: false } as StartOutcome;

    if (input.actor.role === 'EMPLOYER') {
      await requireValidMachineQr(tx, payment.machineId, input.qrToken);
    }

    const machines = await tx.$queryRaw<
      Array<{ id: string; status: string; name: string; deletedAt: Date | null }>
    >(Prisma.sql`
      SELECT id, status, name, "deletedAt" FROM "GameMachine" WHERE id = ${payment.machineId}::uuid FOR UPDATE
    `);
    const machine = machines[0];
    if (!machine || machine.deletedAt) {
      throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');
    }

    if (machine.status !== 'AVAILABLE') {
      // The cash was already received but the machine cannot be used. Void the
      // payment so it cannot be consumed later; the employer must refund the
      // customer physically. The record is preserved for auditing.
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidReason: `Machine ${machine.name} was ${machine.status} when the session was started`,
        },
      });
      await createNotification(tx, {
        businessId: input.businessId,
        audience: 'ADMIN',
        type: 'SYSTEM',
        title: 'Machine unavailable',
        body: `Payment ${payment.transactionRef} was voided because ${machine.name} was ${machine.status.toLowerCase()}.`,
        data: { paymentRef: payment.transactionRef, machineId: machine.id, status: machine.status },
      });
      await recordAudit(tx, {
        businessId: input.businessId,
        userId: input.actor.id,
        actorRole: input.actor.role,
        action: 'PAYMENT_VOIDED',
        entityType: 'Payment',
        entityId: payment.id,
        after: { status: 'VOIDED', reason: 'Machine unavailable at session start' },
      });
      const reason =
        machine.status === 'IN_USE' ? 'IN_USE' : machine.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'INACTIVE';
      return {
        kind: 'busy',
        paymentRef: payment.transactionRef,
        machineName: machine.name,
        reason,
      } as StartOutcome;
    }

    const active = await tx.gameSession.findFirst({
      where: { machineId: machine.id, status: { in: ['CREATED', 'ACTIVE', 'PAUSED'] } },
      select: { id: true },
    });
    if (active) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'VOIDED', voidedAt: new Date(), voidReason: 'Machine already has an active session' },
      });
      await createNotification(tx, {
        businessId: input.businessId,
        audience: 'ADMIN',
        type: 'SYSTEM',
        title: 'Machine unavailable',
        body: `Payment ${payment.transactionRef} was voided because ${machine.name} already had an active session.`,
        data: { paymentRef: payment.transactionRef, machineId: machine.id },
      });
      return {
        kind: 'busy',
        paymentRef: payment.transactionRef,
        machineName: machine.name,
        reason: 'IN_USE',
      } as StartOutcome;
    }

    const now = new Date();
    const endsAt = addMinutes(now, payment.durationMinutesSnapshot);

    const session = await tx.gameSession.create({
      data: {
        businessId: input.businessId,
        machineId: machine.id,
        employerId: payment.employerId,
        paymentId: payment.id,
        packageId: payment.packageId,
        packageNameSnapshot: payment.packageNameSnapshot,
        durationMinutesSnapshot: payment.durationMinutesSnapshot,
        priceSantim: payment.priceSantim,
        status: 'ACTIVE',
        startedAt: now,
        endsAt,
        events: {
          create: {
            type: 'STARTED',
            actorId: input.actor.id,
            actorRole: input.actor.role,
            metadata: { machineId: machine.id, durationMinutes: payment.durationMinutesSnapshot },
          },
        },
      },
      include: sessionInclude,
    });

    await tx.gameMachine.update({ where: { id: machine.id }, data: { status: 'IN_USE' } });

    await createNotification(tx, {
      businessId: input.businessId,
      audience: 'ADMIN',
      type: 'SESSION_STARTED',
      title: 'Session started',
      body: `${payment.packageNameSnapshot} started on ${machine.name} by ${session.employer.fullName}`,
      data: { sessionId: session.id, machineId: machine.id, employerId: session.employerId },
    });
    await createNotification(tx, {
      businessId: input.businessId,
      userId: session.employerId,
      type: 'SESSION_STARTED',
      title: 'Session started',
      body: `${payment.packageNameSnapshot} started on ${machine.name}. Time ends at the scheduled server end time.`,
      data: { sessionId: session.id, machineId: machine.id },
    });

    await recordAudit(tx, {
      businessId: input.businessId,
      userId: input.actor.id,
      actorRole: input.actor.role,
      action: 'SESSION_STARTED',
      entityType: 'GameSession',
      entityId: session.id,
      after: {
        machineId: machine.id,
        paymentRef: payment.transactionRef,
        startsAt: now,
        endsAt,
        priceSantim: payment.priceSantim,
      },
    });

    return { kind: 'ok', session, created: true } as StartOutcome;
  });

  if (outcome.kind === 'busy') {
    emitToBusiness(input.businessId, 'payment:updated', { paymentRef: outcome.paymentRef, status: 'VOIDED' });
    emitToAdmins(input.businessId, 'payment:updated', { paymentRef: outcome.paymentRef, status: 'VOIDED' });
    throw AppError.conflict(
      `${outcome.machineName} is not available (${outcome.reason.replace('_', ' ').toLowerCase()}). ` +
        'The payment was voided - refund the customer and try another machine.',
      'MACHINE_NOT_AVAILABLE',
      { paymentRef: outcome.paymentRef, reason: outcome.reason, paymentVoided: true },
    );
  }

  if (outcome.created) {
    const dto = presentSession(outcome.session);
    emitToBusiness(input.businessId, 'session:started', dto);
    emitToAdmins(input.businessId, 'session:started', dto);
    emitToBusiness(input.businessId, 'machine:status', {
      machineId: dto.machine.id,
      status: 'IN_USE',
    });
    emitToUser(outcome.session.employerId, 'session:started', dto);
  }

  return outcome.session;
}

export interface EndSessionInput {
  businessId: string;
  actor: Actor;
  sessionId: string;
  reason?: string;
  cancelled?: boolean;
  qrToken?: string;
}

export async function endSession(input: EndSessionInput): Promise<SessionWithRelations> {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        businessId: string;
        employerId: string;
        machineId: string;
        status: string;
        startedAt: Date | null;
        endsAt: Date | null;
        pausedAt: Date | null;
        actualEndedAt: Date | null;
        actualDurationSeconds: number | null;
        endedById: string | null;
        totalPausedSeconds: number;
        packageNameSnapshot: string;
        machineName: string;
      }>
    >(Prisma.sql`
      SELECT s.id, s."businessId", s."employerId", s."machineId", s.status, s."startedAt", s."endsAt",
             s."pausedAt", s."actualEndedAt", s."actualDurationSeconds", s."endedById",
             s."totalPausedSeconds", s."packageNameSnapshot", m.name AS "machineName"
      FROM "GameSession" s JOIN "GameMachine" m ON m.id = s."machineId"
      WHERE s.id = ${input.sessionId}::uuid FOR UPDATE OF s
    `);

    const session = rows[0];
    if (!session || session.businessId !== input.businessId) {
      throw AppError.notFound('Session', 'SESSION_NOT_FOUND');
    }
    if (input.actor.role !== 'ADMIN' && session.employerId !== input.actor.id) {
      throw AppError.forbidden('You can only end your own sessions');
    }
    const isExpiredAwaitingQr = session.status === 'EXPIRED' && !session.endedById;
    if (!['ACTIVE', 'PAUSED'].includes(session.status) && !isExpiredAwaitingQr) {
      throw AppError.conflict('This session is not active', 'SESSION_NOT_ACTIVE', {
        status: session.status,
      });
    }

    const settings = await tx.businessSettings.findUnique({
      where: { businessId: input.businessId },
    });

    if (!input.cancelled && !isExpiredAwaitingQr && input.actor.role !== 'ADMIN' && !settings?.allowManualEnd) {
      throw AppError.forbidden(
        'Manual ending is disabled. The session will end automatically when the timer expires.',
        'MANUAL_END_DISABLED',
      );
    }
    if (!input.cancelled && !isExpiredAwaitingQr && settings?.requireEndReason && !input.reason?.trim()) {
      throw AppError.badRequest('A reason is required when ending a session', undefined, 'REASON_REQUIRED');
    }
    if (!input.cancelled && input.actor.role === 'EMPLOYER') {
      await requireValidMachineQr(tx, session.machineId, input.qrToken);
    }

    const pausedExtraMs = session.pausedAt ? now.getTime() - session.pausedAt.getTime() : 0;
    const startedMs = session.startedAt ? session.startedAt.getTime() : now.getTime();
    const actualDurationSeconds = isExpiredAwaitingQr
      ? session.actualDurationSeconds
      : Math.max(
          0,
          Math.floor((now.getTime() - startedMs - session.totalPausedSeconds * 1000 - pausedExtraMs) / 1000),
        );

    const updated = await tx.gameSession.update({
      where: { id: session.id },
      data: {
        status: input.cancelled ? 'CANCELLED' : 'COMPLETED',
        actualEndedAt: isExpiredAwaitingQr ? (session.actualEndedAt ?? now) : now,
        actualDurationSeconds,
        pausedAt: null,
        endedById: input.actor.id,
        endedByRole: input.actor.role,
        endReason: input.reason?.trim() || (isExpiredAwaitingQr ? 'Time expired' : null),
        events: {
          create: {
            type: input.cancelled ? 'CANCELLED' : 'ENDED_MANUAL',
            actorId: input.actor.id,
            actorRole: input.actor.role,
            metadata: {
              reason: input.reason ?? null,
              actualDurationSeconds,
              remainingSeconds: remainingSeconds(session.endsAt, now),
            },
          },
        },
      },
      include: sessionInclude,
    });

    await tx.gameMachine.update({
      where: { id: session.machineId },
      data: { status: 'AVAILABLE' },
    });

    await createNotification(tx, {
      businessId: input.businessId,
      audience: 'ADMIN',
      type: 'SESSION_ENDED',
      title: input.cancelled ? 'Session cancelled' : 'Session ended',
      body: `${session.packageNameSnapshot} on ${session.machineName} was ended by ${input.actor.role === 'ADMIN' ? 'an administrator' : 'the employer'}`,
      data: { sessionId: session.id, machineId: session.machineId },
    });
    await createNotification(tx, {
      businessId: input.businessId,
      userId: session.employerId,
      type: 'SESSION_ENDED',
      title: input.cancelled ? 'Session cancelled' : 'Session ended',
      body: `${session.packageNameSnapshot} on ${session.machineName} has ended.`,
      data: { sessionId: session.id, machineId: session.machineId },
    });

    await recordAudit(tx, {
      businessId: input.businessId,
      userId: input.actor.id,
      actorRole: input.actor.role,
      action: input.cancelled ? 'SESSION_CANCELLED' : 'SESSION_ENDED',
      entityType: 'GameSession',
      entityId: session.id,
      before: { status: session.status, endsAt: session.endsAt },
      after: { status: updated.status, actualEndedAt: now, reason: input.reason ?? null },
    });

    return updated;
  });

  const dto = presentSession(result, now);
  emitToBusiness(input.businessId, 'session:ended', dto);
  emitToAdmins(input.businessId, 'session:ended', dto);
  emitToBusiness(input.businessId, 'machine:status', { machineId: dto.machine.id, status: 'AVAILABLE' });
  emitToUser(result.employerId, 'session:ended', dto);
  return result;
}

async function lockSession(tx: TransactionClient, sessionId: string, businessId: string, actor: Actor) {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      businessId: string;
      employerId: string;
      machineId: string;
      status: string;
      startsAt: Date | null;
      endsAt: Date | null;
      pausedAt: Date | null;
      machineName: string;
      machineStatus: string;
    }>
  >(Prisma.sql`
    SELECT s.id, s."businessId", s."employerId", s."machineId", s.status, s."startedAt" AS "startsAt",
           s."endsAt", s."pausedAt", m.name AS "machineName", m.status AS "machineStatus"
    FROM "GameSession" s JOIN "GameMachine" m ON m.id = s."machineId"
    WHERE s.id = ${sessionId}::uuid FOR UPDATE OF s
  `);
  const session = rows[0];
  if (!session || session.businessId !== businessId) {
    throw AppError.notFound('Session', 'SESSION_NOT_FOUND');
  }
  if (actor.role !== 'ADMIN' && session.employerId !== actor.id) {
    throw AppError.forbidden('You can only manage your own sessions');
  }
  return session;
}

export async function pauseSession(input: {
  businessId: string;
  actor: Actor;
  sessionId: string;
}): Promise<SessionWithRelations> {
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId, input.businessId, input.actor);
    if (session.status !== 'ACTIVE') {
      throw AppError.conflict('Only an active session can be paused', 'SESSION_NOT_ACTIVE');
    }
    const settings = await tx.businessSettings.findUnique({ where: { businessId: input.businessId } });
    if (input.actor.role !== 'ADMIN' && !settings?.allowPause) {
      throw AppError.forbidden('Pausing sessions is disabled by the administrator', 'PAUSE_DISABLED');
    }

    const result = await tx.gameSession.update({
      where: { id: session.id },
      data: {
        status: 'PAUSED',
        pausedAt: now,
        events: {
          create: {
            type: 'PAUSED',
            actorId: input.actor.id,
            actorRole: input.actor.role,
            metadata: { remainingSeconds: remainingSeconds(session.endsAt, now) },
          },
        },
      },
      include: sessionInclude,
    });

    await recordAudit(tx, {
      businessId: input.businessId,
      userId: input.actor.id,
      actorRole: input.actor.role,
      action: 'SESSION_PAUSED',
      entityType: 'GameSession',
      entityId: session.id,
      before: { status: 'ACTIVE', endsAt: session.endsAt },
      after: { status: 'PAUSED', pausedAt: now },
    });

    return result;
  });

  const dto = presentSession(updated, now);
  emitToBusiness(input.businessId, 'session:updated', dto);
  emitToAdmins(input.businessId, 'session:updated', dto);
  return updated;
}

export async function resumeSession(input: {
  businessId: string;
  actor: Actor;
  sessionId: string;
}): Promise<SessionWithRelations> {
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId, input.businessId, input.actor);
    if (session.status !== 'PAUSED' || !session.pausedAt) {
      throw AppError.conflict('This session is not paused', 'SESSION_NOT_PAUSED');
    }
    const settings = await tx.businessSettings.findUnique({ where: { businessId: input.businessId } });
    if (input.actor.role !== 'ADMIN' && !settings?.allowPause) {
      throw AppError.forbidden('Pausing sessions is disabled by the administrator', 'PAUSE_DISABLED');
    }

    const pausedMs = now.getTime() - session.pausedAt.getTime();
    const newEndsAt = new Date((session.endsAt?.getTime() ?? now.getTime()) + pausedMs);

    const result = await tx.gameSession.update({
      where: { id: session.id },
      data: {
        status: 'ACTIVE',
        pausedAt: null,
        endsAt: newEndsAt,
        totalPausedSeconds: { increment: Math.floor(pausedMs / 1000) },
        events: {
          create: {
            type: 'RESUMED',
            actorId: input.actor.id,
            actorRole: input.actor.role,
            metadata: { pausedSeconds: Math.floor(pausedMs / 1000), newEndsAt },
          },
        },
      },
      include: sessionInclude,
    });

    await recordAudit(tx, {
      businessId: input.businessId,
      userId: input.actor.id,
      actorRole: input.actor.role,
      action: 'SESSION_RESUMED',
      entityType: 'GameSession',
      entityId: session.id,
      before: { status: 'PAUSED', endsAt: session.endsAt },
      after: { status: 'ACTIVE', endsAt: newEndsAt },
    });

    return result;
  });

  const dto = presentSession(updated, now);
  emitToBusiness(input.businessId, 'session:updated', dto);
  emitToAdmins(input.businessId, 'session:updated', dto);
  return updated;
}

export interface ExtendSessionInput {
  businessId: string;
  actor: Actor;
  sessionId: string;
  packageId: string;
  idempotencyKey?: string;
  qrToken?: string;
}

/**
 * Adds paid time to a session. The added payment and the new end time are
 * committed together; each extension is stored separately and never mutates the
 * original payment.
 */
export async function extendSession(input: ExtendSessionInput): Promise<SessionWithRelations> {
  const idempotencyKey = input.idempotencyKey?.trim() || newUuid();

  const existingPayment = await prisma.payment.findFirst({
    where: { businessId: input.businessId, idempotencyKey, type: 'EXTENSION' },
    include: { extension: true },
  });
  if (existingPayment?.extension) {
    const existingSession = await prisma.gameSession.findUnique({
      where: { id: existingPayment.extension.sessionId },
      include: sessionInclude,
    });
    if (existingSession) return existingSession;
  }

  const sessionForPackage = await prisma.gameSession.findFirst({
    where: { id: input.sessionId, businessId: input.businessId },
    include: { machine: { select: { id: true, categoryId: true } } },
  });
  if (!sessionForPackage) throw AppError.notFound('Session', 'SESSION_NOT_FOUND');
  if (input.actor.role !== 'ADMIN' && sessionForPackage.employerId !== input.actor.id) {
    throw AppError.forbidden('You can only extend your own sessions');
  }

  const pkg = await requireApplicablePackage(
    input.businessId,
    sessionForPackage.machine,
    input.packageId,
  );

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId, input.businessId, input.actor);

    const txExistingPayment = await tx.payment.findFirst({
      where: { businessId: input.businessId, idempotencyKey, type: 'EXTENSION' },
      include: { extension: true },
    });
    if (txExistingPayment?.extension) {
      const existingSession = await tx.gameSession.findUnique({
        where: { id: txExistingPayment.extension.sessionId },
        include: sessionInclude,
      });
      if (existingSession) return existingSession;
    }

    if (!['ACTIVE', 'PAUSED'].includes(session.status)) {
      throw AppError.conflict('Only an active session can be extended', 'SESSION_NOT_ACTIVE');
    }
    if (session.status === 'ACTIVE' && session.endsAt && session.endsAt <= now) {
      throw AppError.conflict(
        'This session has already expired and cannot be extended',
        'SESSION_EXPIRED',
      );
    }
    if (session.machineStatus !== 'IN_USE') {
      throw AppError.conflict('Machine is no longer in use', 'MACHINE_NOT_IN_USE');
    }
    const settings = await tx.businessSettings.findUnique({ where: { businessId: input.businessId } });
    if (input.actor.role !== 'ADMIN' && !settings?.allowExtension) {
      throw AppError.forbidden('Session extensions are disabled by the administrator', 'EXTENSION_DISABLED');
    }
    if (input.actor.role === 'EMPLOYER') {
      await requireValidMachineQr(tx, session.machineId, input.qrToken);
    }

    const previousEndsAt = session.endsAt ?? now;
    const newEndsAt = addMinutes(previousEndsAt, pkg.durationMinutes);

    const payment = await tx.payment.create({
      data: {
        businessId: input.businessId,
        transactionRef: transactionReference('EXT'),
        type: 'EXTENSION',
        employerId: session.employerId,
        createdById: input.actor.id,
        machineId: session.machineId,
        packageId: pkg.id,
        packageNameSnapshot: pkg.name,
        durationMinutesSnapshot: pkg.durationMinutes,
        amountSantim: pkg.priceSantim,
        currency: 'ETB',
        method: 'CASH',
        status: 'PAID',
        paidAt: now,
        idempotencyKey,
      },
    });

    const extension = await tx.sessionExtension.create({
      data: {
        sessionId: session.id,
        paymentId: payment.id,
        packageId: pkg.id,
        packageNameSnapshot: pkg.name,
        durationMinutes: pkg.durationMinutes,
        priceSantim: pkg.priceSantim,
        previousEndsAt,
        newEndsAt,
        createdById: input.actor.id,
      },
    });

    const result = await tx.gameSession.update({
      where: { id: session.id },
      data: {
        endsAt: newEndsAt,
        durationMinutesSnapshot: { increment: pkg.durationMinutes },
        priceSantim: { increment: pkg.priceSantim },
        events: {
          create: {
            type: 'EXTENDED',
            actorId: input.actor.id,
            actorRole: input.actor.role,
            metadata: {
              extensionId: extension.id,
              packageName: pkg.name,
              durationMinutes: pkg.durationMinutes,
              previousEndsAt,
              newEndsAt,
            },
          },
        },
      },
      include: sessionInclude,
    });

    await createNotification(tx, {
      businessId: input.businessId,
      userId: session.employerId,
      type: 'SESSION_EXTENDED',
      title: 'Session extended',
      body: `${pkg.name} added to ${session.machineName}. New end time updated.`,
      data: { sessionId: session.id, extensionId: extension.id },
    });
    await createNotification(tx, {
      businessId: input.businessId,
      audience: 'ADMIN',
      type: 'SESSION_EXTENDED',
      title: 'Session extended',
      body: `${pkg.name} (+${pkg.durationMinutes} min) added on ${session.machineName}`,
      data: { sessionId: session.id, extensionId: extension.id },
    });

    await recordAudit(tx, {
      businessId: input.businessId,
      userId: input.actor.id,
      actorRole: input.actor.role,
      action: 'SESSION_EXTENDED',
      entityType: 'GameSession',
      entityId: session.id,
      before: { endsAt: previousEndsAt },
      after: { endsAt: newEndsAt, extensionId: extension.id, priceSantim: pkg.priceSantim },
    });

    return result;
  });

  const dto = presentSession(updated, now);
  emitToBusiness(input.businessId, 'session:updated', dto);
  emitToAdmins(input.businessId, 'session:updated', dto);
  emitToUser(updated.employerId, 'session:updated', dto);
  emitToBusiness(input.businessId, 'payment:created', {
    paymentRef: updated.extensions.at(-1)?.payment.transactionRef,
    amountSantim: updated.extensions.at(-1)?.priceSantim,
    type: 'EXTENSION',
  });
  return updated;
}
