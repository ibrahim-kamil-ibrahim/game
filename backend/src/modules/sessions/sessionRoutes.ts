import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { paginationSchema, buildPageMeta, getPagination } from '../../utils/pagination';
import {
  endSession,
  extendSession,
  pauseSession,
  presentSession,
  resumeSession,
  sessionInclude,
  startSession,
} from '../../services/sessionService';

const router = Router();
router.use(authenticate);

const startSchema = z.object({
  paymentId: z.string().uuid('A valid payment is required'),
  qrToken: z.string().trim().min(8).max(500).optional(),
});

const listQuerySchema = paginationSchema.extend({
  status: z.enum(['CREATED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'EXPIRED']).optional(),
  machineId: z.string().uuid().optional(),
  employerId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(120).optional(),
});

const endSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  qrToken: z.string().trim().min(8).max(500).optional(),
});

const extendSchema = z.object({
  packageId: z.string().uuid('Select an extension package'),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
  qrToken: z.string().trim().min(8).max(500).optional(),
});

router.post(
  '/start',
  validate({ body: startSchema }),
  asyncHandler(async (req, res) => {
    const session = await startSession({
      businessId: req.user!.businessId,
      actor: { id: req.user!.id, role: req.user!.role },
      paymentId: req.body.paymentId,
      qrToken: req.body.qrToken,
    });
    res.status(201).json({
      success: true,
      data: { session: presentSession(session), serverTime: new Date().toISOString() },
    });
  }),
);

router.get(
  '/active',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const sessions = await prisma.gameSession.findMany({
      where: {
        businessId: req.user!.businessId,
        OR: [{ status: { in: ['ACTIVE', 'PAUSED'] } }, { status: 'EXPIRED', endedById: null }],
        ...(req.user!.role === 'EMPLOYER' ? { employerId: req.user!.id } : {}),
      },
      include: sessionInclude,
      orderBy: { endsAt: 'asc' },
    });
    res.json({
      success: true,
      data: sessions.map((session) => presentSession(session, now)),
      serverTime: now.toISOString(),
    });
  }),
);

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as never as {
      page: number;
      pageSize: number;
      status?: string;
      machineId?: string;
      employerId?: string;
      from?: string;
      to?: string;
      search?: string;
    };
    const pagination = getPagination(query);
    const where: Prisma.GameSessionWhereInput = {
      businessId: req.user!.businessId,
      ...(req.user!.role === 'EMPLOYER'
        ? { employerId: req.user!.id }
        : query.employerId
          ? { employerId: query.employerId }
          : {}),
      ...(query.status ? { status: query.status as Prisma.GameSessionWhereInput['status'] } : {}),
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
              { machine: { name: { contains: query.search, mode: 'insensitive' } } },
              { machine: { code: { contains: query.search, mode: 'insensitive' } } },
              { payment: { transactionRef: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, sessions, revenue] = await Promise.all([
      prisma.gameSession.count({ where }),
      prisma.gameSession.findMany({
        where,
        include: sessionInclude,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.gameSession.aggregate({ where, _sum: { priceSantim: true } }),
    ]);

    const now = new Date();
    res.json({
      success: true,
      data: sessions.map((session) => presentSession(session, now)),
      meta: buildPageMeta(total, pagination),
      summary: { sessionRevenueSantim: revenue._sum.priceSantim ?? 0 },
      serverTime: now.toISOString(),
    });
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const session = await prisma.gameSession.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId },
      include: {
        ...sessionInclude,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw AppError.notFound('Session', 'SESSION_NOT_FOUND');
    if (req.user!.role === 'EMPLOYER' && session.employerId !== req.user!.id) {
      throw AppError.forbidden('You can only view your own sessions');
    }
    const now = new Date();
    res.json({
      success: true,
      data: {
        session: presentSession(session, now),
        events: session.events,
        serverTime: now.toISOString(),
      },
    });
  }),
);

router.post(
  '/:id/end',
  validate({ params: idParamSchema, body: endSchema }),
  asyncHandler(async (req, res) => {
    const session = await endSession({
      businessId: req.user!.businessId,
      actor: { id: req.user!.id, role: req.user!.role },
      sessionId: req.params.id,
      reason: req.body.reason,
      qrToken: req.body.qrToken,
    });
    res.json({ success: true, data: presentSession(session) });
  }),
);

router.post(
  '/:id/cancel',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: endSchema }),
  asyncHandler(async (req, res) => {
    const session = await endSession({
      businessId: req.user!.businessId,
      actor: { id: req.user!.id, role: req.user!.role },
      sessionId: req.params.id,
      reason: req.body.reason,
      cancelled: true,
    });
    res.json({ success: true, data: presentSession(session) });
  }),
);

const handleExtend = asyncHandler(async (req, res) => {
  const session = await extendSession({
    businessId: req.user!.businessId,
    actor: { id: req.user!.id, role: req.user!.role },
    sessionId: req.params.id,
    packageId: req.body.packageId,
    idempotencyKey: req.body.idempotencyKey,
    qrToken: req.body.qrToken,
  });
  res.json({ success: true, data: presentSession(session) });
});

router.post('/:id/extensions', validate({ params: idParamSchema, body: extendSchema }), handleExtend);
router.post('/:id/extend', validate({ params: idParamSchema, body: extendSchema }), handleExtend);

router.post(
  '/:id/pause',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const session = await pauseSession({
      businessId: req.user!.businessId,
      actor: { id: req.user!.id, role: req.user!.role },
      sessionId: req.params.id,
    });
    res.json({ success: true, data: presentSession(session) });
  }),
);

router.post(
  '/:id/resume',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const session = await resumeSession({
      businessId: req.user!.businessId,
      actor: { id: req.user!.id, role: req.user!.role },
      sessionId: req.params.id,
    });
    res.json({ success: true, data: presentSession(session) });
  }),
);

router.get(
  '/:id/events',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const session = await prisma.gameSession.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId },
      select: { id: true, employerId: true },
    });
    if (!session) throw AppError.notFound('Session', 'SESSION_NOT_FOUND');
    if (req.user!.role === 'EMPLOYER' && session.employerId !== req.user!.id) {
      throw AppError.forbidden('You can only view your own sessions');
    }
    const events = await prisma.sessionEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: events });
  }),
);

export default router;
