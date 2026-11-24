import { Prisma, type PaymentStatus, type PaymentType } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/errors';
import { requireApplicablePackage } from '../../services/packageService';
import { transactionReference } from '../../utils/money';
import { getPagination, buildPageMeta, type Pagination } from '../../utils/pagination';
import { recordAudit } from '../../services/auditService';
import { createNotification } from '../../services/notificationService';
import { emitToAdmins, emitToBusiness, emitToUser } from '../../sockets';
import type { Request } from 'express';

const paymentInclude = Prisma.validator<Prisma.PaymentInclude>()({
  machine: { select: { id: true, name: true, code: true } },
  employer: { select: { id: true, fullName: true, username: true } },
  package: { select: { id: true, name: true } },
  session: { select: { id: true, status: true } },
});

type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export function presentPayment(payment: PaymentWithRelations) {
  return {
    id: payment.id,
    transactionRef: payment.transactionRef,
    type: payment.type,
    status: payment.status,
    method: payment.method,
    amountSantim: payment.amountSantim,
    currency: payment.currency,
    packageName: payment.packageNameSnapshot,
    durationMinutes: payment.durationMinutesSnapshot,
    machine: payment.machine,
    employer: payment.employer,
    packageId: payment.packageId,
    sessionId: payment.session?.id ?? null,
    sessionStatus: payment.session?.status ?? null,
    notes: payment.notes,
    paidAt: payment.paidAt,
    refundedAt: payment.refundedAt,
    voidedAt: payment.voidedAt,
    voidReason: payment.voidReason,
    createdAt: payment.createdAt,
  };
}

export async function findPayment(businessId: string, id: string): Promise<PaymentWithRelations> {
  const payment = await prisma.payment.findFirst({
    where: { id, businessId },
    include: paymentInclude,
  });
  if (!payment) throw AppError.notFound('Payment', 'PAYMENT_NOT_FOUND');
  return payment;
}

export interface CreateCashPaymentInput {
  machineId: string;
  packageId: string;
  idempotencyKey: string;
  notes?: string;
  employerId?: string;
}

export async function createCashPayment(input: {
  businessId: string;
  actorId: string;
  actorRole: 'ADMIN' | 'EMPLOYER';
  data: CreateCashPaymentInput;
  req: Request;
}) {
  const { businessId, actorId, actorRole, data } = input;

  const existing = await prisma.payment.findFirst({
    where: { businessId, idempotencyKey: data.idempotencyKey },
    include: paymentInclude,
  });
  if (existing) {
    if (existing.employerId !== actorId && actorRole !== 'ADMIN') {
      throw AppError.conflict('This payment reference has already been used', 'IDEMPOTENCY_KEY_REUSED');
    }
    return { payment: presentPayment(existing), created: false };
  }

  const machine = await prisma.gameMachine.findFirst({
    where: { id: data.machineId, businessId, deletedAt: null },
  });
  if (!machine) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');
  if (machine.status !== 'AVAILABLE') {
    throw AppError.conflict(
      `${machine.name} is not available for rental (status: ${machine.status}).`,
      'MACHINE_NOT_AVAILABLE',
      { machineStatus: machine.status },
    );
  }
  const liveSession = await prisma.gameSession.findFirst({
    where: { machineId: machine.id, status: { in: ['CREATED', 'ACTIVE', 'PAUSED'] } },
    select: { id: true },
  });
  if (liveSession) {
    throw AppError.conflict('This machine already has an active session', 'MACHINE_IN_USE');
  }

  const pkg = await requireApplicablePackage(businessId, machine, data.packageId);

  let employerId = actorId;
  if (actorRole === 'ADMIN') {
    if (!data.employerId) {
      throw AppError.badRequest('Select the employer who collected the cash', undefined, 'EMPLOYER_REQUIRED');
    }
    const employer = await prisma.user.findFirst({
      where: { id: data.employerId, businessId, role: 'EMPLOYER', status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!employer) throw AppError.badRequest('The selected employer is not active', undefined, 'EMPLOYER_NOT_FOUND');
    employerId = employer.id;
  } else {
    const self = await prisma.user.findUnique({ where: { id: actorId }, select: { status: true } });
    if (!self || self.status !== 'ACTIVE') throw AppError.forbidden('Account is not active', 'ACCOUNT_SUSPENDED');
  }

  const now = new Date();
  const transactionRef = transactionReference('CASH');

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        businessId,
        transactionRef,
        type: 'RENTAL',
        employerId,
        createdById: actorId,
        machineId: machine.id,
        packageId: pkg.id,
        packageNameSnapshot: pkg.name,
        durationMinutesSnapshot: pkg.durationMinutes,
        amountSantim: pkg.priceSantim,
        currency: 'ETB',
        method: 'CASH',
        status: 'PAID',
        paidAt: now,
        idempotencyKey: data.idempotencyKey,
        notes: data.notes?.trim() || null,
      },
      include: paymentInclude,
    });

    await createNotification(tx, {
      businessId,
      audience: 'ADMIN',
      type: 'PAYMENT_RECORDED',
      title: 'Cash payment recorded',
      body: `${pkg.name} on ${machine.name}: ${(pkg.priceSantim / 100).toFixed(2)} ETB (${created.transactionRef})`,
      data: {
        paymentId: created.id,
        machineId: machine.id,
        amountSantim: pkg.priceSantim,
        employerId,
      },
    });

    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole,
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: created.id,
      after: {
        transactionRef,
        machineId: machine.id,
        packageId: pkg.id,
        amountSantim: pkg.priceSantim,
        method: 'CASH',
      },
      req: input.req,
    });

    return created;
  });

  const dto = presentPayment(payment);
  emitToBusiness(businessId, 'payment:created', dto);
  emitToAdmins(businessId, 'payment:created', dto);
  emitToUser(employerId, 'payment:created', dto);

  return { payment: dto, created: true };
}

export interface PaymentListQuery extends Partial<Pagination> {
  status?: PaymentStatus;
  type?: PaymentType;
  machineId?: string;
  employerId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listPayments(
  businessId: string,
  actor: { id: string; role: 'ADMIN' | 'EMPLOYER' },
  query: PaymentListQuery,
) {
  const pagination = getPagination(query);
  const where: Prisma.PaymentWhereInput = {
    businessId,
    ...(actor.role === 'EMPLOYER' ? { employerId: actor.id } : query.employerId ? { employerId: query.employerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.machineId ? { machineId: query.machineId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { transactionRef: { contains: query.search, mode: 'insensitive' } },
            { machine: { name: { contains: query.search, mode: 'insensitive' } } },
            { machine: { code: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, payments, totals] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.payment.aggregate({
      where: { ...where, status: 'PAID' },
      _sum: { amountSantim: true },
      _count: { _all: true },
    }),
  ]);

  return {
    items: payments.map(presentPayment),
    meta: buildPageMeta(total, pagination),
    summary: {
      collectedSantim: totals._sum.amountSantim ?? 0,
      paidTransactions: totals._count._all,
    },
  };
}

export async function getPayment(businessId: string, id: string, actor: { id: string; role: 'ADMIN' | 'EMPLOYER' }) {
  const payment = await prisma.payment.findFirst({
    where: { id, businessId },
    include: {
      ...paymentInclude,
      extension: {
        include: { session: { select: { id: true, machineId: true } } },
      },
    },
  });
  if (!payment) throw AppError.notFound('Payment', 'PAYMENT_NOT_FOUND');
  if (actor.role === 'EMPLOYER' && payment.employerId !== actor.id) {
    throw AppError.forbidden('You can only view your own payments');
  }
  return {
    ...presentPayment(payment),
    extension: payment.extension,
    session: payment.session,
  };
}

export async function voidPayment(
  businessId: string,
  id: string,
  reason: string,
  actorId: string,
  req: Request,
) {
  const payment = await prisma.payment.findFirst({
    where: { id, businessId },
    include: { session: true, extension: true },
  });
  if (!payment) throw AppError.notFound('Payment', 'PAYMENT_NOT_FOUND');
  if (payment.status !== 'PAID') {
    throw AppError.conflict(`Only paid transactions can be voided (current status: ${payment.status})`, 'INVALID_STATUS');
  }
  if (payment.session && !['CANCELLED'].includes(payment.session.status)) {
    throw AppError.conflict('This payment is linked to a session and cannot be voided', 'PAYMENT_IN_USE');
  }
  if (payment.extension) {
    throw AppError.conflict('This payment is an extension and cannot be voided', 'PAYMENT_IN_USE');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.payment.update({
      where: { id },
      data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason },
      include: paymentInclude,
    });

    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'PAYMENT_VOIDED',
      entityType: 'Payment',
      entityId: id,
      before: { status: 'PAID', amountSantim: payment.amountSantim },
      after: { status: 'VOIDED', reason },
      req,
    });

    return result;
  });

  const dto = presentPayment(updated);
  emitToBusiness(businessId, 'payment:updated', dto);
  emitToAdmins(businessId, 'payment:updated', dto);
  emitToUser(updated.employerId, 'payment:updated', dto);
  return dto;
}

export async function refundPayment(
  businessId: string,
  id: string,
  reason: string,
  actorId: string,
  req: Request,
) {
  const payment = await prisma.payment.findFirst({
    where: { id, businessId },
    include: { session: true, extension: true },
  });
  if (!payment) throw AppError.notFound('Payment', 'PAYMENT_NOT_FOUND');
  if (payment.status !== 'PAID') {
    throw AppError.conflict(`Only paid transactions can be refunded (current status: ${payment.status})`, 'INVALID_STATUS');
  }
  if (payment.session && ['ACTIVE', 'PAUSED'].includes(payment.session.status)) {
    throw AppError.conflict('End the active session before refunding this payment', 'SESSION_ACTIVE');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.payment.update({
      where: { id },
      data: { status: 'REFUNDED', refundedAt: new Date(), voidReason: reason },
      include: paymentInclude,
    });

    await recordAudit(tx, {
      businessId,
      userId: actorId,
      actorRole: 'ADMIN',
      action: 'PAYMENT_REFUNDED',
      entityType: 'Payment',
      entityId: id,
      before: { status: 'PAID', amountSantim: payment.amountSantim },
      after: { status: 'REFUNDED', reason },
      req,
    });

    return result;
  });

  const dto = presentPayment(updated);
  emitToBusiness(businessId, 'payment:updated', dto);
  emitToAdmins(businessId, 'payment:updated', dto);
  emitToUser(updated.employerId, 'payment:updated', dto);
  return dto;
}

export async function getEmployerDailySummary(businessId: string, employerId: string, timezone: string) {
  const { startOfDay, endOfDay } = await import('../../utils/time');
  const now = new Date();
  const from = startOfDay(now, timezone);
  const to = endOfDay(now, timezone);

  const [payments, sessions, activeSessions] = await Promise.all([
    prisma.payment.aggregate({
      where: { businessId, employerId, status: 'PAID', paidAt: { gte: from, lte: to } },
      _sum: { amountSantim: true },
      _count: { _all: true },
    }),
    prisma.gameSession.count({
      where: { businessId, employerId, startedAt: { gte: from, lte: to }, status: { in: ['COMPLETED', 'EXPIRED'] } },
    }),
    prisma.gameSession.count({ where: { businessId, employerId, status: { in: ['ACTIVE', 'PAUSED'] } } }),
  ]);

  return {
    collectedSantim: payments._sum.amountSantim ?? 0,
    transactions: payments._count._all,
    completedSessions: sessions,
    activeSessions,
  };
}
