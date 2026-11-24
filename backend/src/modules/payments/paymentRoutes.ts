import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { paginationSchema } from '../../utils/pagination';
import {
  createCashPayment,
  getPayment,
  listPayments,
  refundPayment,
  voidPayment,
} from './paymentService';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  machineId: z.string().uuid('Select a machine'),
  packageId: z.string().uuid('Select a package'),
  idempotencyKey: z.string().trim().min(8, 'An idempotency key is required').max(128),
  notes: z.string().trim().max(500).optional(),
  employerId: z.string().uuid().optional(),
});

const listQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'PAID', 'REFUNDED', 'VOIDED']).optional(),
  type: z.enum(['RENTAL', 'EXTENSION']).optional(),
  machineId: z.string().uuid().optional(),
  employerId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(120).optional(),
});

const actionSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});

router.post(
  '/cash',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const result = await createCashPayment({
      businessId: req.user!.businessId,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      data: req.body,
      req,
    });
    res.status(result.created ? 201 : 200).json({ success: true, data: result.payment });
  }),
);

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await listPayments(
      req.user!.businessId,
      { id: req.user!.id, role: req.user!.role },
      req.query as never,
    );
    res.json({ success: true, data: result.items, meta: result.meta, summary: result.summary });
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const payment = await getPayment(req.user!.businessId, req.params.id, {
      id: req.user!.id,
      role: req.user!.role,
    });
    res.json({ success: true, data: payment });
  }),
);

router.post(
  '/:id/void',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: actionSchema }),
  asyncHandler(async (req, res) => {
    const payment = await voidPayment(
      req.user!.businessId,
      req.params.id,
      req.body.reason,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: payment });
  }),
);

router.post(
  '/:id/refund',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: actionSchema }),
  asyncHandler(async (req, res) => {
    const payment = await refundPayment(
      req.user!.businessId,
      req.params.id,
      req.body.reason,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: payment });
  }),
);

export default router;
