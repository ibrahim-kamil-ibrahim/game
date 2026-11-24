import { Router } from 'express';
import { z } from 'zod';
import type { MachineStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate, idParamSchema } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { paginationSchema } from '../../utils/pagination';
import {
  createMachine,
  deleteMachine,
  getLiveMachines,
  getMachine,
  getMachineHistory,
  getMachineStats,
  listMachines,
  regenerateMachineQr,
  setMachineStatus,
  updateMachine,
} from './machineService';
import { getQrInfo, renderQrPdf, renderQrPng } from '../../services/qrRenderService';

const router = Router();

router.use(authenticate);

const listQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE']).optional(),
  categoryId: z.string().uuid().optional(),
});

const machineBodySchema = z.object({
  name: z.string().trim().min(2, 'Machine name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Machine code is required')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Code may only contain letters, numbers, dot, dash and underscore'),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(1000).optional(),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  imageUrl: z.string().trim().max(2000).optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'INACTIVE']).optional(),
});

const machineUpdateSchema = machineBodySchema.partial().extend({
  description: z.string().trim().max(1000).nullable().optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  serialNumber: z.string().trim().max(120).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  imageUrl: z.string().trim().max(2000).nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'INACTIVE']),
});

// NOTE: /live must be registered before /:id so it is not captured as an id.
router.get(
  '/live',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = await getLiveMachines(req.user!.businessId);
    res.json({ success: true, data });
  }),
);

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await listMachines(req.user!.businessId, req.query as never);
    res.json({ success: true, data: result.items, meta: result.meta });
  }),
);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: machineBodySchema }),
  asyncHandler(async (req, res) => {
    const machine = await createMachine(req.user!.businessId, req.body, req.user!.id, req);
    res.status(201).json({ success: true, data: machine });
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await getMachine(req.user!.businessId, req.params.id);
    res.json({ success: true, data: result });
  }),
);

router.patch(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: machineUpdateSchema }),
  asyncHandler(async (req, res) => {
    const machine = await updateMachine(
      req.user!.businessId,
      req.params.id,
      req.body,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: machine });
  }),
);

router.patch(
  '/:id/status',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, body: statusSchema }),
  asyncHandler(async (req, res) => {
    const machine = await setMachineStatus(
      req.user!.businessId,
      req.params.id,
      req.body.status as Exclude<MachineStatus, 'IN_USE'>,
      req.user!.id,
      req,
    );
    res.json({ success: true, data: machine });
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await deleteMachine(req.user!.businessId, req.params.id, req.user!.id, req);
    res.json({ success: true, data: { message: 'Machine removed' } });
  }),
);

router.get(
  '/:id/qr',
  requireRole('ADMIN'),
  validate({ params: idParamSchema, query: z.object({ format: z.enum(['png', 'pdf', 'json']).default('png') }) }),
  asyncHandler(async (req, res) => {
    const format = (req.query as { format: string }).format;

    if (format === 'json') {
      const info = await getQrInfo(req.params.id, req.user!.businessId);
      res.json({ success: true, data: info });
      return;
    }

    if (format === 'pdf') {
      const pdf = await renderQrPdf(req.params.id, req.user!.businessId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(pdf.buffer);
      return;
    }

    const png = await renderQrPng(req.params.id, req.user!.businessId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${png.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(png.buffer);
  }),
);

router.post(
  '/:id/qr/regenerate',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await regenerateMachineQr(
      req.user!.businessId,
      req.params.id,
      req.user!.id,
      req,
    );
    res.json({
      success: true,
      data: { ...result, message: 'A new QR code was generated. The previous code is no longer valid.' },
    });
  }),
);

router.get(
  '/:id/history',
  validate({ params: idParamSchema, query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const result = await getMachineHistory(req.user!.businessId, req.params.id, req.query as never);
    res.json({ success: true, data: result });
  }),
);

router.get(
  '/:id/stats',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await getMachineStats(req.user!.businessId, req.params.id);
    res.json({ success: true, data: result });
  }),
);

export default router;
