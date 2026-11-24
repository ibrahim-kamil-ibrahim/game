import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { createCategory, deleteCategory, listCategories, updateCategory } from './categoryService';

const router = Router();

router.use(authenticate);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Category name is required').max(80),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await listCategories(req.user!.businessId);
    res.json({ success: true, data: categories });
  }),
);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const category = await createCategory(req.user!.businessId, req.body, req.user!.id, req);
    res.status(201).json({ success: true, data: category });
  }),
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const category = await updateCategory(
      req.user!.businessId,
      req.params.id,
      req.body,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: category });
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deleteCategory(req.user!.businessId, req.params.id, req.user!.id, req);
    res.json({ success: true, data: { message: 'Category deleted' } });
  }),
);

export default router;
