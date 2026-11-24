import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { paginationSchema } from '../../utils/pagination';
import {
  createEmployer,
  getEmployer,
  getEmployerActivity,
  listEmployers,
  resetEmployerPassword,
  setEmployerStatus,
  updateEmployer,
} from './employerService';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const createSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dot, dash and underscore')
    .optional(),
  phone: z.string().trim().max(32).optional(),
  password: passwordSchema.optional(),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .optional(),
  phone: z.string().trim().max(32).nullable().optional(),
});

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });
const resetPasswordSchema = z
  .object({ newPassword: passwordSchema.optional() })
  .default({});

const listQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await listEmployers(req.user!.businessId, req.query as never);
    res.json({ success: true, data: result.items, meta: result.meta });
  }),
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const employer = await createEmployer(req.user!.businessId, req.body, req.user!.id, req);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ success: true, data: employer });
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await getEmployer(req.user!.businessId, req.params.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: result });
  }),
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const employer = await updateEmployer(
      req.user!.businessId,
      req.params.id,
      req.body,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: employer });
  }),
);

router.patch(
  '/:id/status',
  validate({ params: idParamSchema, body: statusSchema }),
  asyncHandler(async (req, res) => {
    const employer = await setEmployerStatus(
      req.user!.businessId,
      req.params.id,
      req.body.status,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: employer });
  }),
);

router.post(
  '/:id/reset-password',
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await resetEmployerPassword(
      req.user!.businessId,
      req.params.id,
      req.body.newPassword,
      req.user!.id,
      req,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: result });
  }),
);

router.get(
  '/:id/activity',
  validate({ params: idParamSchema, query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const result = await getEmployerActivity(
      req.user!.businessId,
      req.params.id,
      req.query as never,
    );
    res.json({ success: true, data: result });
  }),
);

export default router;
