import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { recordAudit } from '../../services/auditService';
import { AppError } from '../../utils/errors';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

const updateSchema = z.object({
  allowExtension: z.boolean().optional(),
  allowPause: z.boolean().optional(),
  allowManualEnd: z.boolean().optional(),
  requireEndReason: z.boolean().optional(),
  expiryWarningMinutes: z.coerce.number().int().min(1).max(60).optional(),
  lowCashThresholdSantim: z.coerce.number().int().min(0).nullable().optional(),
  businessName: z.string().trim().min(2).max(120).optional(),
  businessPhone: z.string().trim().max(32).nullable().optional(),
  businessAddress: z.string().trim().max(250).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: req.user!.businessId },
      include: { settings: true },
    });
    res.json({
      success: true,
      data: {
        business: {
          id: business.id,
          name: business.name,
          phone: business.phone,
          address: business.address,
          currency: business.currency,
          timezone: business.timezone,
          createdAt: business.createdAt,
        },
        settings: business.settings,
      },
    });
  }),
);

router.patch(
  '/',
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const businessId = req.user!.businessId;
    const existing = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { settings: true },
    });

    if (req.body.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: req.body.timezone });
      } catch {
        throw AppError.badRequest('Invalid timezone identifier', undefined, 'INVALID_TIMEZONE');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (
        req.body.businessName !== undefined ||
        req.body.businessPhone !== undefined ||
        req.body.businessAddress !== undefined ||
        req.body.timezone !== undefined
      ) {
        await tx.business.update({
          where: { id: businessId },
          data: {
            ...(req.body.businessName !== undefined ? { name: req.body.businessName } : {}),
            ...(req.body.businessPhone !== undefined ? { phone: req.body.businessPhone || null } : {}),
            ...(req.body.businessAddress !== undefined ? { address: req.body.businessAddress || null } : {}),
            ...(req.body.timezone !== undefined ? { timezone: req.body.timezone } : {}),
          },
        });
      }

      const settingsData = {
        ...(req.body.allowExtension !== undefined ? { allowExtension: req.body.allowExtension } : {}),
        ...(req.body.allowPause !== undefined ? { allowPause: req.body.allowPause } : {}),
        ...(req.body.allowManualEnd !== undefined ? { allowManualEnd: req.body.allowManualEnd } : {}),
        ...(req.body.requireEndReason !== undefined ? { requireEndReason: req.body.requireEndReason } : {}),
        ...(req.body.expiryWarningMinutes !== undefined
          ? { expiryWarningMinutes: req.body.expiryWarningMinutes }
          : {}),
        ...(req.body.lowCashThresholdSantim !== undefined
          ? { lowCashThresholdSantim: req.body.lowCashThresholdSantim }
          : {}),
      };

      if (Object.keys(settingsData).length > 0) {
        await tx.businessSettings.upsert({
          where: { businessId },
          create: { businessId, ...settingsData },
          update: settingsData,
        });
      }

      await recordAudit(tx, {
        businessId,
        userId: req.user!.id,
        actorRole: 'ADMIN',
        action: 'SETTINGS_UPDATED',
        entityType: 'BusinessSettings',
        entityId: businessId,
        before: {
          business: { name: existing.name, phone: existing.phone, address: existing.address, timezone: existing.timezone },
          settings: existing.settings,
        },
        after: req.body,
        req,
      });

      return tx.business.findUniqueOrThrow({
        where: { id: businessId },
        include: { settings: true },
      });
    });

    res.json({
      success: true,
      data: {
        business: {
          id: updated.id,
          name: updated.name,
          phone: updated.phone,
          address: updated.address,
          currency: updated.currency,
          timezone: updated.timezone,
        },
        settings: updated.settings,
      },
    });
  }),
);

export default router;
