import { Router } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { startOfDay, endOfDay } from '../../utils/time';
import { sessionInclude, presentSession } from '../../services/sessionService';
import { machineListInclude, presentMachine } from '../machines/machineService';

const router = Router();
router.use(authenticate);

/**
 * Compact operational snapshot used by the Employer mobile home screen.
 * Employers only ever see their own financial and session data here.
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const businessId = req.user!.businessId;
    const now = new Date();

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { settings: true },
    });

    const todayStart = startOfDay(now, business.timezone);
    const todayEnd = endOfDay(now, business.timezone);

    const [paymentSummary, completedSessions, activeSessions, machines, recentPayments, unreadNotifications] =
      await Promise.all([
        prisma.payment.aggregate({
          where: {
            businessId,
            employerId: req.user!.id,
            status: 'PAID',
            paidAt: { gte: todayStart, lte: todayEnd },
          },
          _sum: { amountSantim: true },
          _count: { _all: true },
        }),
        prisma.gameSession.count({
          where: {
            businessId,
            employerId: req.user!.id,
            startedAt: { gte: todayStart, lte: todayEnd },
            status: { in: ['COMPLETED', 'EXPIRED'] },
          },
        }),
        prisma.gameSession.findMany({
          where: { businessId, employerId: req.user!.id, status: { in: ['ACTIVE', 'PAUSED'] } },
          include: sessionInclude,
          orderBy: { endsAt: 'asc' },
        }),
        prisma.gameMachine.findMany({
          where: { businessId, deletedAt: null },
          include: machineListInclude,
          orderBy: { code: 'asc' },
        }),
        prisma.payment.findMany({
          where: { businessId, employerId: req.user!.id },
          orderBy: { paidAt: 'desc' },
          take: 5,
          include: { machine: { select: { name: true, code: true } } },
        }),
        prisma.notification.count({
          where: { businessId, userId: req.user!.id, readAt: null },
        }),
      ]);

    const machineItems = machines.map((machine) => presentMachine(machine, now));

    res.json({
      success: true,
      data: {
        employer: {
          id: req.user!.id,
          fullName: req.user!.fullName,
          username: req.user!.username,
        },
        business: {
          name: business.name,
          currency: business.currency,
          timezone: business.timezone,
          settings: business.settings,
        },
        today: {
          collectedSantim: paymentSummary._sum.amountSantim ?? 0,
          transactions: paymentSummary._count._all,
          completedSessions,
          activeSessions: activeSessions.length,
          unreadNotifications,
        },
        machines: {
          total: machineItems.length,
          available: machineItems.filter((m) => m.status === 'AVAILABLE').length,
          inUse: machineItems.filter((m) => m.status === 'IN_USE').length,
          maintenance: machineItems.filter((m) => m.status === 'MAINTENANCE').length,
        },
        activeSessions: activeSessions.map((session) => presentSession(session, now)),
        machineList: machineItems,
        recentPayments: recentPayments.map((payment) => ({
          id: payment.id,
          transactionRef: payment.transactionRef,
          amountSantim: payment.amountSantim,
          status: payment.status,
          paidAt: payment.paidAt,
          machine: payment.machine,
          packageName: payment.packageNameSnapshot,
        })),
        serverTime: now.toISOString(),
      },
    });
  }),
);

export default router;
