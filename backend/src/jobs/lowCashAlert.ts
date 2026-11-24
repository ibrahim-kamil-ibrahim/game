import { prisma } from '../config/database';
import { startOfDay } from '../utils/time';
import { formatEtb } from '../utils/money';
import { createNotification } from '../services/notificationService';

/**
 * Sends at most one "low cash collection" alert per business per day after
 * 18:00 local time when today's collected cash is below the configured
 * threshold. This covers the "unusual cash collection" admin alert.
 */
export async function checkLowCashAlerts(now = new Date()): Promise<number> {
  const businesses = await prisma.business.findMany({
    include: { settings: true },
  });

  let sent = 0;

  for (const business of businesses) {
    const threshold = business.settings?.lowCashThresholdSantim;
    if (threshold === null || threshold === undefined || threshold <= 0) continue;

    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: business.timezone,
        hour: '2-digit',
        hour12: false,
      }).format(now),
    );
    if (hour < 18) continue;

    const from = startOfDay(now, business.timezone);
    const collected = await prisma.payment.aggregate({
      where: {
        businessId: business.id,
        status: 'PAID',
        paidAt: { gte: from, lte: now },
      },
      _sum: { amountSantim: true },
      _count: { _all: true },
    });
    const total = collected._sum.amountSantim ?? 0;
    if (total >= threshold) continue;

    const alreadySent = await prisma.notification.findFirst({
      where: {
        businessId: business.id,
        audience: 'ADMIN',
        type: 'SYSTEM',
        title: 'Low cash collection today',
        createdAt: { gte: from },
      },
      select: { id: true },
    });
    if (alreadySent) continue;

    await createNotification(prisma, {
      businessId: business.id,
      audience: 'ADMIN',
      type: 'SYSTEM',
      title: 'Low cash collection today',
      body: `Only ${formatEtb(total)} has been collected today (${collected._count._all} transactions), below the ${formatEtb(
        threshold,
      )} alert threshold.`,
      data: {
        collectedSantim: total,
        thresholdSantim: threshold,
        transactions: collected._count._all,
        businessDate: from.toISOString(),
      },
    });
    sent += 1;
  }

  return sent;
}
