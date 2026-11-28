import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { qrLimiter } from '../../middleware/rateLimit';
import { hashQrToken, normalizeQrPayload } from '../../services/qrService';
import { getApplicablePackages, packageOptionDto } from '../../services/packageService';
import { presentSession, sessionInclude } from '../../services/sessionService';
import { remainingSeconds } from '../../utils/time';

const router = Router();

const resolveSchema = z.object({
  token: z.string().trim().min(8, 'A QR code payload is required').max(500),
});

/**
 * Resolves a scanned machine QR code. Machine data is always read from the
 * database; nothing supplied by the mobile application is trusted.
 */
router.post(
  '/resolve',
  authenticate,
  qrLimiter,
  validate({ body: resolveSchema }),
  asyncHandler(async (req, res) => {
    const tokenHash = hashQrToken(normalizeQrPayload(req.body.token));

    const record = await prisma.machineQRCode.findFirst({
      where: { tokenHash, isActive: true },
      include: {
        machine: {
          include: {
            category: { select: { id: true, name: true } },
            business: { include: { settings: true } },
          },
        },
      },
    });

    if (!record || record.machine.deletedAt || record.machine.businessId !== req.user!.businessId) {
      throw new AppError(
        404,
        'QR_NOT_RECOGNIZED',
        'This QR code is not recognized. It may belong to a removed machine or an old code. Ask the administrator for a replacement.',
      );
    }

    const machine = record.machine;
    const now = new Date();
    const activeSession = await prisma.gameSession.findFirst({
      where: { machineId: machine.id, status: { in: ['CREATED', 'ACTIVE', 'PAUSED'] } },
      include: {
        employer: { select: { id: true, fullName: true } },
        payment: { select: { transactionRef: true, amountSantim: true } },
      },
    });

    const baseMachine = {
      id: machine.id,
      name: machine.name,
      code: machine.code,
      description: machine.description,
      brand: machine.brand,
      model: machine.model,
      location: machine.location,
      imageUrl: machine.imageUrl,
      status: machine.status,
      category: machine.category,
    };

    if (machine.status === 'INACTIVE') {
      throw new AppError(409, 'MACHINE_INACTIVE', `${machine.name} is inactive and cannot be rented.`, {
        machine: baseMachine,
      });
    }
    if (machine.status === 'MAINTENANCE') {
      throw new AppError(409, 'MACHINE_MAINTENANCE', `${machine.name} is under maintenance.`, {
        machine: baseMachine,
      });
    }

    const packages = await getApplicablePackages(machine);
    const settingsDto = {
      allowExtension: machine.business.settings?.allowExtension ?? true,
      allowPause: machine.business.settings?.allowPause ?? false,
      allowManualEnd: machine.business.settings?.allowManualEnd ?? false,
      requireEndReason: machine.business.settings?.requireEndReason ?? false,
    };

    if (activeSession && ['ACTIVE', 'PAUSED'].includes(activeSession.status)) {
      const isExpired = activeSession.status === 'ACTIVE' && activeSession.endsAt && activeSession.endsAt <= now;
      if (isExpired) {
        throw new AppError(409, 'MACHINE_IN_USE', `${machine.name} has an expired session awaiting QR checkout.`, {
          machine: baseMachine,
          activeSession: {
            id: activeSession.id,
            employer: activeSession.employer,
            endsAt: activeSession.endsAt,
            remainingSeconds: 0,
          },
        });
      }

      const fullSession = await prisma.gameSession.findUnique({
        where: { id: activeSession.id },
        include: sessionInclude,
      });

      res.json({
        success: true,
        data: {
          machine: baseMachine,
          packages: packages.map(packageOptionDto),
          available: false,
          activeSession: fullSession ? presentSession(fullSession, now) : null,
          serverTime: now.toISOString(),
          settings: settingsDto,
        },
      });
      return;
    }

    if (machine.status !== 'AVAILABLE' || activeSession) {
      throw new AppError(409, 'MACHINE_IN_USE', `${machine.name} is currently in use.`, {
        machine: baseMachine,
        activeSession: activeSession
          ? {
              id: activeSession.id,
              employer: activeSession.employer,
              endsAt: activeSession.endsAt,
              remainingSeconds: remainingSeconds(activeSession.endsAt, now),
            }
          : null,
      });
    }

    if (packages.length === 0) {
      throw new AppError(
        409,
        'NO_PACKAGES',
        `${machine.name} is available but no game packages are configured for it. Ask the administrator to add a package.`,
        { machine: baseMachine },
      );
    }

    res.json({
      success: true,
      data: {
        machine: baseMachine,
        packages: packages.map(packageOptionDto),
        available: true,
        activeSession: null,
        serverTime: now.toISOString(),
        settings: settingsDto,
      },
    });
  }),
);

export default router;
