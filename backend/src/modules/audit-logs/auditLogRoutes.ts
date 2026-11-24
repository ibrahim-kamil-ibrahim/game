import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { paginationSchema, buildPageMeta, getPagination } from '../../utils/pagination';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

const querySchema = paginationSchema.extend({
  userId: z.string().uuid().optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(120).optional(),
});

router.get(
  '/',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as never as {
      page: number;
      pageSize: number;
      userId?: string;
      action?: string;
      entityType?: string;
      from?: string;
      to?: string;
      search?: string;
    };
    const pagination = getPagination(query);
    const where: Prisma.AuditLogWhereInput = {
      businessId: req.user!.businessId,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
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
              { action: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
              { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, items, actions] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.auditLog.findMany({
        where: { businessId: req.user!.businessId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
    ]);

    res.json({
      success: true,
      data: items,
      meta: buildPageMeta(total, pagination),
      filters: { actions: actions.map((row) => row.action) },
    });
  }),
);

export default router;
