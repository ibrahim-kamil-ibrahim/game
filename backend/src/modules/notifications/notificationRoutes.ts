import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { paginationSchema, buildPageMeta, getPagination } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const querySchema = paginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

router.get(
  '/',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as never as { page: number; pageSize: number; unreadOnly?: boolean };
    const pagination = getPagination(query);
    const where: Prisma.NotificationWhereInput = {
      businessId: req.user!.businessId,
      ...(req.user!.role === 'ADMIN'
        ? { OR: [{ userId: req.user!.id }, { audience: 'ADMIN' }] }
        : { userId: req.user!.id }),
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [total, items, unreadCount] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.notification.count({
        where: {
          businessId: req.user!.businessId,
          ...(req.user!.role === 'ADMIN'
            ? { OR: [{ userId: req.user!.id }, { audience: 'ADMIN' }] }
            : { userId: req.user!.id }),
          readAt: null,
        },
      }),
    ]);

    res.json({
      success: true,
      data: items,
      meta: buildPageMeta(total, pagination),
      unreadCount,
    });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: {
        businessId: req.user!.businessId,
        ...(req.user!.role === 'ADMIN'
          ? { OR: [{ userId: req.user!.id }, { audience: 'ADMIN' }] }
          : { userId: req.user!.id }),
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    res.json({ success: true, data: { message: 'All notifications marked as read' } });
  }),
);

router.post(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        businessId: req.user!.businessId,
        ...(req.user!.role === 'ADMIN'
          ? { OR: [{ userId: req.user!.id }, { audience: 'ADMIN' }] }
          : { userId: req.user!.id }),
      },
    });
    if (!notification) throw AppError.notFound('Notification', 'NOTIFICATION_NOT_FOUND');

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
    res.json({ success: true, data: updated });
  }),
);

export default router;
