import { prisma } from '../config/database';
import {
  addDays,
  formatDateInTimezone,
  parseDateRange,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from '../utils/time';
import { getLiveMachines } from '../modules/machines/machineService';
import { presentSession, sessionInclude } from './sessionService';

async function revenueBetween(businessId: string, from: Date, to: Date) {
  const result = await prisma.payment.aggregate({
    where: { businessId, status: 'PAID', paidAt: { gte: from, lte: to } },
    _sum: { amountSantim: true },
    _count: { _all: true },
  });
  return { santim: result._sum.amountSantim ?? 0, transactions: result._count._all };
}

export async function getDashboard(businessId: string) {
  const now = new Date();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: { settings: true },
  });
  const tz = business.timezone;

  const todayStart = startOfDay(now, tz);
  const weekStart = startOfWeek(now, tz);
  const monthStart = startOfMonth(now, tz);
  const yearStart = startOfYear(now, tz);
  const seriesStart = startOfDay(addDays(now, -13), tz);
  const topPeriodStart = startOfMonth(now, tz);

  const [
    today,
    week,
    month,
    year,
    allTime,
    refundsToday,
    machineCounts,
    sessionsTotal,
    sessionsActive,
    sessionsToday,
    sessionAverages,
    employersTotal,
    employersActive,
    expensesMonth,
    topMachineRevenue,
    topEmployerRevenue,
    revenueSeriesPayments,
    sessionSeries,
    recentPayments,
    recentSessions,
    unreadNotifications,
    live,
  ] = await Promise.all([
    revenueBetween(businessId, todayStart, now),
    revenueBetween(businessId, weekStart, now),
    revenueBetween(businessId, monthStart, now),
    revenueBetween(businessId, yearStart, now),
    prisma.payment.aggregate({ where: { businessId, status: 'PAID' }, _sum: { amountSantim: true } }),
    prisma.payment.aggregate({
      where: { businessId, status: 'REFUNDED', refundedAt: { gte: todayStart, lte: now } },
      _sum: { amountSantim: true },
      _count: { _all: true },
    }),
    prisma.gameMachine.groupBy({
      by: ['status'],
      where: { businessId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.gameSession.count({ where: { businessId } }),
    prisma.gameSession.count({ where: { businessId, status: { in: ['ACTIVE', 'PAUSED'] } } }),
    prisma.gameSession.count({ where: { businessId, startedAt: { gte: todayStart } } }),
    prisma.gameSession.aggregate({
      where: { businessId, actualDurationSeconds: { not: null } },
      _avg: { actualDurationSeconds: true },
    }),
    prisma.user.count({ where: { businessId, role: 'EMPLOYER', deletedAt: null } }),
    prisma.user.count({ where: { businessId, role: 'EMPLOYER', status: 'ACTIVE', deletedAt: null } }),
    prisma.expense.aggregate({
      where: { businessId, deletedAt: null, expenseDate: { gte: monthStart, lte: now } },
      _sum: { amountSantim: true },
    }),
    prisma.payment.groupBy({
      by: ['machineId'],
      where: { businessId, status: 'PAID', paidAt: { gte: topPeriodStart, lte: now } },
      _sum: { amountSantim: true },
      _count: { _all: true },
      orderBy: { _sum: { amountSantim: 'desc' } },
      take: 5,
    }),
    prisma.payment.groupBy({
      by: ['employerId'],
      where: { businessId, status: 'PAID', paidAt: { gte: topPeriodStart, lte: now } },
      _sum: { amountSantim: true },
      _count: { _all: true },
      orderBy: { _sum: { amountSantim: 'desc' } },
      take: 5,
    }),
    prisma.payment.findMany({
      where: { businessId, status: 'PAID', paidAt: { gte: seriesStart, lte: now } },
      select: { amountSantim: true, paidAt: true },
    }),
    prisma.gameSession.findMany({
      where: { businessId, startedAt: { gte: seriesStart, lte: now } },
      select: { startedAt: true },
    }),
    prisma.payment.findMany({
      where: { businessId },
      include: {
        machine: { select: { id: true, name: true, code: true } },
        employer: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.gameSession.findMany({
      where: { businessId },
      include: sessionInclude,
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.notification.count({
      where: { businessId, audience: 'ADMIN', readAt: null },
    }),
    getLiveMachines(businessId),
  ]);

  const machineCountMap = new Map(machineCounts.map((row) => [row.status, row._count._all]));
  const machineIds = topMachineRevenue.map((row) => row.machineId);
  const employerIds = topEmployerRevenue.map((row) => row.employerId);

  const [machineNames, employerNames, topMachineSessions] = await Promise.all([
    prisma.gameMachine.findMany({
      where: { id: { in: machineIds } },
      select: { id: true, name: true, code: true },
    }),
    prisma.user.findMany({
      where: { id: { in: employerIds } },
      select: { id: true, fullName: true, username: true },
    }),
    prisma.gameSession.groupBy({
      by: ['machineId'],
      where: { machineId: { in: machineIds }, startedAt: { gte: topPeriodStart, lte: now } },
      _count: { _all: true },
    }),
  ]);

  const machineNameMap = new Map(machineNames.map((machine) => [machine.id, machine]));
  const employerNameMap = new Map(employerNames.map((employer) => [employer.id, employer]));
  const machineSessionMap = new Map(topMachineSessions.map((row) => [row.machineId, row._count._all]));

  const seriesMap = new Map<string, { date: string; revenueSantim: number; sessions: number }>();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = addDays(now, -offset);
    const key = formatDateInTimezone(day, tz);
    seriesMap.set(key, { date: key, revenueSantim: 0, sessions: 0 });
  }
  for (const payment of revenueSeriesPayments) {
    if (!payment.paidAt) continue;
    const key = formatDateInTimezone(payment.paidAt, tz);
    const entry = seriesMap.get(key);
    if (entry) entry.revenueSantim += payment.amountSantim;
  }
  for (const session of sessionSeries) {
    if (!session.startedAt) continue;
    const key = formatDateInTimezone(session.startedAt, tz);
    const entry = seriesMap.get(key);
    if (entry) entry.sessions += 1;
  }

  const monthRevenue = month.santim;

  return {
    business: {
      id: business.id,
      name: business.name,
      currency: business.currency,
      timezone: business.timezone,
    },
    serverTime: now.toISOString(),
    revenue: {
      todaySantim: today.santim,
      todayTransactions: today.transactions,
      weekSantim: week.santim,
      monthSantim: monthRevenue,
      yearSantim: year.santim,
      allTimeSantim: allTime._sum.amountSantim ?? 0,
      refundedTodaySantim: refundsToday._sum.amountSantim ?? 0,
      refundedTodayCount: refundsToday._count._all,
    },
    finance: {
      expensesMonthSantim: expensesMonth._sum.amountSantim ?? 0,
      profitMonthSantim: monthRevenue - (expensesMonth._sum.amountSantim ?? 0),
    },
    machines: {
      total: live.summary.total,
      available: live.summary.available,
      inUse: live.summary.inUse,
      maintenance: live.summary.maintenance,
      inactive: live.summary.inactive,
      byStatus: {
        AVAILABLE: machineCountMap.get('AVAILABLE') ?? 0,
        IN_USE: machineCountMap.get('IN_USE') ?? 0,
        MAINTENANCE: machineCountMap.get('MAINTENANCE') ?? 0,
        INACTIVE: machineCountMap.get('INACTIVE') ?? 0,
      },
    },
    sessions: {
      total: sessionsTotal,
      active: sessionsActive,
      today: sessionsToday,
      averageDurationMinutes: Math.round((sessionAverages._avg.actualDurationSeconds ?? 0) / 60),
    },
    employers: {
      total: employersTotal,
      active: employersActive,
    },
    notifications: { unread: unreadNotifications },
    topMachines: topMachineRevenue.map((row) => ({
      id: row.machineId,
      name: machineNameMap.get(row.machineId)?.name ?? 'Machine',
      code: machineNameMap.get(row.machineId)?.code ?? '',
      revenueSantim: row._sum.amountSantim ?? 0,
      sessions: machineSessionMap.get(row.machineId) ?? 0,
    })),
    topEmployers: topEmployerRevenue.map((row) => ({
      id: row.employerId,
      fullName: employerNameMap.get(row.employerId)?.fullName ?? 'Employer',
      username: employerNameMap.get(row.employerId)?.username ?? '',
      revenueSantim: row._sum.amountSantim ?? 0,
      transactions: row._count._all,
    })),
    revenueSeries: Array.from(seriesMap.values()),
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      transactionRef: payment.transactionRef,
      amountSantim: payment.amountSantim,
      status: payment.status,
      method: payment.method,
      paidAt: payment.paidAt,
      machine: payment.machine,
      employer: payment.employer,
      packageName: payment.packageNameSnapshot,
    })),
    recentSessions: recentSessions.map((session) => presentSession(session, now)),
    machineOverview: live.machines,
    settings: business.settings,
  };
}

export async function getAnalytics(
  businessId: string,
  from: string | undefined,
  to: string | undefined,
  granularityHint?: 'day' | 'week' | 'month',
) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: { settings: true },
  });
  const range = parseDateRange({ from, to, timezone: business.timezone, defaultDays: 30 });
  const granularity =
    granularityHint ??
    (range.to.getTime() - range.from.getTime() > 120 * 86400000 ? 'month' : 'day');

  const [payments, sessions, expenses, machines, employers, packages] = await Promise.all([
    prisma.payment.findMany({
      where: { businessId, status: 'PAID', paidAt: { gte: range.from, lte: range.to } },
      select: { amountSantim: true, paidAt: true, type: true },
    }),
    prisma.gameSession.findMany({
      where: { businessId, startedAt: { gte: range.from, lte: range.to } },
      select: { startedAt: true, status: true, actualDurationSeconds: true, machineId: true, packageNameSnapshot: true },
    }),
    prisma.expense.findMany({
      where: { businessId, deletedAt: null, expenseDate: { gte: range.from, lte: range.to } },
      select: { amountSantim: true, expenseDate: true, category: true },
    }),
    prisma.gameMachine.findMany({
      where: { businessId, deletedAt: null },
      select: { status: true },
    }),
    prisma.user.findMany({
      where: { businessId, role: 'EMPLOYER', deletedAt: null },
      select: { status: true },
    }),
    prisma.payment.groupBy({
      by: ['packageNameSnapshot'],
      where: { businessId, status: 'PAID', paidAt: { gte: range.from, lte: range.to } },
      _sum: { amountSantim: true },
      _count: { _all: true },
      orderBy: { _sum: { amountSantim: 'desc' } },
      take: 10,
    }),
  ]);

  const bucketFor = (date: Date) => {
    if (granularity === 'month') return formatDateInTimezone(date, business.timezone).slice(0, 7);
    if (granularity === 'week') return formatDateInTimezone(startOfWeek(date, business.timezone), business.timezone);
    return formatDateInTimezone(date, business.timezone);
  };

  const seriesMap = new Map<string, { bucket: string; revenueSantim: number; sessions: number; expensesSantim: number }>();
  const ensure = (bucket: string) => {
    let entry = seriesMap.get(bucket);
    if (!entry) {
      entry = { bucket, revenueSantim: 0, sessions: 0, expensesSantim: 0 };
      seriesMap.set(bucket, entry);
    }
    return entry;
  };

  for (const payment of payments) {
    if (payment.paidAt) ensure(bucketFor(payment.paidAt)).revenueSantim += payment.amountSantim;
  }
  for (const session of sessions) {
    if (session.startedAt) ensure(bucketFor(session.startedAt)).sessions += 1;
  }
  for (const expense of expenses) {
    ensure(bucketFor(expense.expenseDate)).expensesSantim += expense.amountSantim;
  }

  const revenueTotal = payments.reduce((sum, payment) => sum + payment.amountSantim, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amountSantim, 0);
  const completedSessions = sessions.filter((session) => session.actualDurationSeconds !== null);

  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      timezone: range.timezone,
      granularity,
    },
    totals: {
      revenueSantim: revenueTotal,
      rentalRevenueSantim: payments
        .filter((payment) => payment.type === 'RENTAL')
        .reduce((sum, payment) => sum + payment.amountSantim, 0),
      extensionRevenueSantim: payments
        .filter((payment) => payment.type === 'EXTENSION')
        .reduce((sum, payment) => sum + payment.amountSantim, 0),
      transactions: payments.length,
      sessions: sessions.length,
      averageDurationSeconds:
        completedSessions.length > 0
          ? Math.round(
              completedSessions.reduce((sum, session) => sum + (session.actualDurationSeconds ?? 0), 0) /
                completedSessions.length,
            )
          : 0,
      expensesSantim: expenseTotal,
      profitSantim: revenueTotal - expenseTotal,
      machines: {
        total: machines.length,
        inUse: machines.filter((machine) => machine.status === 'IN_USE').length,
        maintenance: machines.filter((machine) => machine.status === 'MAINTENANCE').length,
        available: machines.filter((machine) => machine.status === 'AVAILABLE').length,
      },
      employers: {
        total: employers.length,
        active: employers.filter((employer) => employer.status === 'ACTIVE').length,
      },
    },
    series: Array.from(seriesMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
    topPackages: packages.map((row) => ({
      name: row.packageNameSnapshot,
      revenueSantim: row._sum.amountSantim ?? 0,
      transactions: row._count._all,
    })),
  };
}
