import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { paginationSchema } from '../../utils/pagination';
import {
  createPackage,
  deletePackage,
  getPackage,
  getPackageStats,
  listPackages,
  updatePackage,
} from './packageManagementService';

const router = Router();
router.use(authenticate);

const scopeSchema = z.enum(['ALL', 'CATEGORY', 'MACHINES']);

const createSchema = z
  .object({
    name: z.string().trim().min(2, 'Package name is required').max(80),
    description: z.string().trim().max(1000).nullable().optional(),
    durationMinutes: z.coerce.number().int().min(1, 'Duration must be at least 1 minute').max(1440),
    priceSantim: z.coerce.number().int().min(1, 'Price must be greater than zero').max(100_000_000),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    scope: scopeSchema.optional(),
    categoryId: z.string().uuid().nullable().optional(),
    machineIds: z.array(z.string().uuid()).max(500).optional(),
    displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'CATEGORY' && !value.categoryId) {
      ctx.addIssue({ code: 'custom', message: 'A category is required for category scope', path: ['categoryId'] });
    }
    if (value.scope === 'MACHINES' && (!value.machineIds || value.machineIds.length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'At least one machine is required', path: ['machineIds'] });
    }
  });

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  priceSantim: z.coerce.number().int().min(1).max(100_000_000).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  scope: scopeSchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  machineIds: z.array(z.string().uuid()).max(500).optional(),
  displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
});

const listQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  scope: scopeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  includeDeleted: z.coerce.boolean().optional(),
});

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = { ...(req.query as never as Record<string, unknown>) } as Record<string, unknown>;
    if (req.user!.role !== 'ADMIN') {
      query.status = 'ACTIVE';
      query.includeDeleted = false;
    }
    const result = await listPackages(req.user!.businessId, query as never);
    res.json({ success: true, data: result.items, meta: result.meta });
  }),
);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const pkg = await createPackage(req.user!.businessId, req.body, req.user!.id, req);
    res.status(201).json({ success: true, data: pkg });
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const pkg = await getPackage(req.user!.businessId, req.params.id);
    res.json({ success: true, data: pkg });
  }),
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const pkg = await updatePackage(
      req.user!.businessId,
      req.params.id,
      req.body,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: pkg });
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deletePackage(req.user!.businessId, req.params.id, req.user!.id, req);
    res.json({ success: true, data: { message: 'Package deleted' } });
  }),
);

router.get(
  '/:id/stats',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const stats = await getPackageStats(req.user!.businessId, req.params.id);
    res.json({ success: true, data: stats });
  }),
);

export default router;
