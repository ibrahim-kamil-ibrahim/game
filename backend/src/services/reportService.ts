import { prisma } from '../config/database';
import { formatDateInTimezone, startOfWeek } from '../utils/time';

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface ReportFilters {
  businessId: string;
  from: Date;
  to: Date;
  timezone: string;
  machineId?: string;
  employerId?: string;
  packageId?: string;
  status?: string;
}

export interface ReportMeta {
  from: string;
  to: string;
  timezone: string;
  granularity: Granularity;
  filters: {
    machineId?: string;
    employerId?: string;
    packageId?: string;
    status?: string;
  };
}

export function reportMeta(filters: ReportFilters, granularity: Granularity): ReportMeta {
  return {
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
    timezone: filters.timezone,
    granularity,
    filters: {
      machineId: filters.machineId,
      employerId: filters.employerId,
      packageId: filters.packageId,
      status: filters.status,
    },
  };
}

export function bucketKey(date: Date, granularity: Granularity, timezone: string): string {
  if (granularity === 'year') return formatDateInTimezone(date, timezone).slice(0, 4);
  if (granularity === 'month') return formatDateInTimezone(date, timezone).slice(0, 7);
  if (granularity === 'week') {
    return formatDateInTimezone(startOfWeek(date, timezone), timezone);
  }
  return formatDateInTimezone(date, timezone);
}

interface Bucket {
  bucket: string;
  revenueSantim: number;
  transactions: number;
}

function emptyBuckets(filters: ReportFilters, granularity: Granularity): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  const cursor = new Date(filters.from.getTime());
  // Guard against absurd ranges producing millions of buckets.
  let guard = 0;
  while (cursor.getTime() <= filters.to.getTime() && guard < 1000) {
    const key = bucketKey(cursor, granularity, filters.timezone);
    if (!map.has(key)) map.set(key, { bucket: key, revenueSantim: 0, transactions: 0 });
    const step =
      granularity === 'day'
        ? 86400000
        : granularity === 'week'
          ? 7 * 86400000
          : granularity === 'month'
            ? 30 * 86400000
            : 365 * 86400000;
    cursor.setTime(cursor.getTime() + step);
    guard += 1;
  }
  return map;
}

function dateFilter(filters: Omit<ReportFilters, 'from' | 'to'> & { from: Date; to: Date }) {
  return {
    businessId: filters.businessId,
    ...(filters.machineId ? { machineId: filters.machineId } : {}),
    ...(filters.employerId ? { employerId: filters.employerId } : {}),
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
  };
}

const paymentSelect = {
  id: true,
  amountSantim: true,
  paidAt: true,
  refundedAt: true,
  status: true,
  type: true,
  transactionRef: true,
  machineId: true,
  employerId: true,
  packageId: true,
  packageNameSnapshot: true,
  durationMinutesSnapshot: true,
  createdAt: true,
  machine: { select: { id: true, name: true, code: true } },
  employer: { select: { id: true, fullName: true, username: true } },
} as const;

export async function getRevenueReport(filters: ReportFilters, granularity: Granularity = 'day') {
  const payments = await prisma.payment.findMany({
    where: {
      ...dateFilter(filters),
      paidAt: { gte: filters.from, lte: filters.to },
      status: filters.status ? (filters.status as never) : 'PAID',
    },
    select: paymentSelect,
    orderBy: { paidAt: 'asc' },
  });

  const buckets = emptyBuckets(filters, granularity);
  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const key = bucketKey(payment.paidAt, granularity, filters.timezone);
    const bucket = buckets.get(key) ?? { bucket: key, revenueSantim: 0, transactions: 0 };
    bucket.revenueSantim += payment.amountSantim;
    bucket.transactions += 1;
    buckets.set(key, bucket);
  }

  const total = payments.reduce((sum, payment) => sum + payment.amountSantim, 0);
  const refunds = await prisma.payment.aggregate({
    where: {
      ...dateFilter(filters),
      status: 'REFUNDED',
      refundedAt: { gte: filters.from, lte: filters.to },
    },
    _sum: { amountSantim: true },
    _count: { _all: true },
  });

  return {
    meta: reportMeta(filters, granularity),
    totals: {
      revenueSantim: total,
      transactions: payments.length,
      averageTransactionSantim: payments.length > 0 ? Math.round(total / payments.length) : 0,
      refundedSantim: refunds._sum.amountSantim ?? 0,
      refundedTransactions: refunds._count._all,
    },
    series: Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
  };
}

export async function getMachineReport(filters: ReportFilters) {
  const [machines, payments, sessionStats] = await Promise.all([
    prisma.gameMachine.findMany({
      where: {
        businessId: filters.businessId,
        deletedAt: null,
        ...(filters.machineId ? { id: filters.machineId } : {}),
      },
      select: { id: true, name: true, code: true, status: true, category: { select: { name: true } } },
      orderBy: { code: 'asc' },
    }),
    prisma.payment.findMany({
      where: {
        ...dateFilter(filters),
        status: 'PAID',
        paidAt: { gte: filters.from, lte: filters.to },
      },
      select: { machineId: true, amountSantim: true },
    }),
    prisma.gameSession.findMany({
      where: {
        businessId: filters.businessId,
        startedAt: { gte: filters.from, lte: filters.to },
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
        ...(filters.employerId ? { employerId: filters.employerId } : {}),
      },
      select: { machineId: true, priceSantim: true, actualDurationSeconds: true, status: true },
    }),
  ]);

  const revenueMap = new Map<string, number>();
  for (const payment of payments) {
    revenueMap.set(payment.machineId, (revenueMap.get(payment.machineId) ?? 0) + payment.amountSantim);
  }
  const sessionMap = new Map<string, { count: number; durationTotal: number; completed: number; sessionRevenue: number }>();
  for (const session of sessionStats) {
    const entry =
      sessionMap.get(session.machineId) ?? { count: 0, durationTotal: 0, completed: 0, sessionRevenue: 0 };
    entry.count += 1;
    entry.sessionRevenue += session.priceSantim;
    if (session.actualDurationSeconds !== null) {
      entry.durationTotal += session.actualDurationSeconds;
      entry.completed += 1;
    }
    sessionMap.set(session.machineId, entry);
  }

  const items = machines.map((machine) => {
    const sessions = sessionMap.get(machine.id);
    return {
      machineId: machine.id,
      name: machine.name,
      code: machine.code,
      status: machine.status,
      category: machine.category?.name ?? null,
      revenueSantim: revenueMap.get(machine.id) ?? 0,
      sessions: sessions?.count ?? 0,
      sessionRevenueSantim: sessions?.sessionRevenue ?? 0,
      averageDurationSeconds:
        sessions && sessions.completed > 0 ? Math.round(sessions.durationTotal / sessions.completed) : 0,
    };
  });

  const totals = items.reduce(
    (acc, item) => ({
      revenueSantim: acc.revenueSantim + item.revenueSantim,
      sessions: acc.sessions + item.sessions,
    }),
    { revenueSantim: 0, sessions: 0 },
  );

  return {
    meta: reportMeta(filters, 'day'),
    totals,
    items: items.sort((a, b) => b.revenueSantim - a.revenueSantim),
  };
}

export async function getEmployerReport(filters: ReportFilters) {
  const [employers, payments, sessions] = await Promise.all([
    prisma.user.findMany({
      where: {
        businessId: filters.businessId,
        role: 'EMPLOYER',
        deletedAt: null,
        ...(filters.employerId ? { id: filters.employerId } : {}),
      },
      select: { id: true, fullName: true, username: true, status: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.payment.findMany({
      where: {
        businessId: filters.businessId,
        status: 'PAID',
        paidAt: { gte: filters.from, lte: filters.to },
        ...(filters.employerId ? { employerId: filters.employerId } : {}),
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
      },
      select: { employerId: true, amountSantim: true, type: true },
    }),
    prisma.gameSession.findMany({
      where: {
        businessId: filters.businessId,
        startedAt: { gte: filters.from, lte: filters.to },
        ...(filters.employerId ? { employerId: filters.employerId } : {}),
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
      },
      select: { employerId: true, actualDurationSeconds: true, status: true },
    }),
  ]);

  const paymentMap = new Map<string, { collected: number; transactions: number; extensions: number }>();
  for (const payment of payments) {
    const entry = paymentMap.get(payment.employerId) ?? { collected: 0, transactions: 0, extensions: 0 };
    entry.collected += payment.amountSantim;
    entry.transactions += 1;
    if (payment.type === 'EXTENSION') entry.extensions += 1;
    paymentMap.set(payment.employerId, entry);
  }

  const sessionMap = new Map<string, { sessions: number; durationTotal: number; completed: number }>();
  for (const session of sessions) {
    const entry = sessionMap.get(session.employerId) ?? { sessions: 0, durationTotal: 0, completed: 0 };
    entry.sessions += 1;
    if (session.actualDurationSeconds !== null) {
      entry.durationTotal += session.actualDurationSeconds;
      entry.completed += 1;
    }
    sessionMap.set(session.employerId, entry);
  }

  const items = employers.map((employer) => {
    const pay = paymentMap.get(employer.id);
    const sess = sessionMap.get(employer.id);
    return {
      employerId: employer.id,
      fullName: employer.fullName,
      username: employer.username,
      status: employer.status,
      collectedSantim: pay?.collected ?? 0,
      transactions: pay?.transactions ?? 0,
      extensionTransactions: pay?.extensions ?? 0,
      sessions: sess?.sessions ?? 0,
      averageDurationSeconds:
        sess && sess.completed > 0 ? Math.round(sess.durationTotal / sess.completed) : 0,
    };
  });

  return {
    meta: reportMeta(filters, 'day'),
    totals: {
      collectedSantim: items.reduce((sum, item) => sum + item.collectedSantim, 0),
      sessions: items.reduce((sum, item) => sum + item.sessions, 0),
    },
    items: items.sort((a, b) => b.collectedSantim - a.collectedSantim),
  };
}

export async function getPackageReport(filters: ReportFilters) {
  const [packages, payments, sessions] = await Promise.all([
    prisma.gamePackage.findMany({
      where: {
        businessId: filters.businessId,
        ...(filters.packageId ? { id: filters.packageId } : {}),
      },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        priceSantim: true,
        status: true,
        deletedAt: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.payment.findMany({
      where: {
        businessId: filters.businessId,
        status: 'PAID',
        paidAt: { gte: filters.from, lte: filters.to },
        ...(filters.packageId ? { packageId: filters.packageId } : {}),
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
        ...(filters.employerId ? { employerId: filters.employerId } : {}),
      },
      select: { packageId: true, packageNameSnapshot: true, amountSantim: true, type: true },
    }),
    prisma.gameSession.findMany({
      where: {
        businessId: filters.businessId,
        startedAt: { gte: filters.from, lte: filters.to },
        ...(filters.packageId ? { packageId: filters.packageId } : {}),
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
        ...(filters.employerId ? { employerId: filters.employerId } : {}),
      },
      select: { packageId: true, priceSantim: true },
    }),
  ]);

  const revenue = new Map<string, { revenue: number; transactions: number }>();
  for (const payment of payments) {
    const key = payment.packageId ?? payment.packageNameSnapshot;
    const entry = revenue.get(key) ?? { revenue: 0, transactions: 0 };
    entry.revenue += payment.amountSantim;
    entry.transactions += 1;
    revenue.set(key, entry);
  }
  const sessionCount = new Map<string, number>();
  for (const session of sessions) {
    const key = session.packageId ?? 'deleted';
    sessionCount.set(key, (sessionCount.get(key) ?? 0) + 1);
  }

  const items = packages.map((pkg) => ({
    packageId: pkg.id,
    name: pkg.name,
    durationMinutes: pkg.durationMinutes,
    currentPriceSantim: pkg.priceSantim,
    status: pkg.deletedAt ? 'DELETED' : pkg.status,
    revenueSantim: revenue.get(pkg.id)?.revenue ?? 0,
    transactions: revenue.get(pkg.id)?.transactions ?? 0,
    sessions: sessionCount.get(pkg.id) ?? 0,
  }));

  return {
    meta: reportMeta(filters, 'day'),
    totals: {
      revenueSantim: items.reduce((sum, item) => sum + item.revenueSantim, 0),
      sessions: items.reduce((sum, item) => sum + item.sessions, 0),
    },
    items: items.sort((a, b) => b.revenueSantim - a.revenueSantim),
  };
}

export async function getSessionsReport(filters: ReportFilters, granularity: Granularity = 'day') {
  const where = {
    businessId: filters.businessId,
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.machineId ? { machineId: filters.machineId } : {}),
    ...(filters.employerId ? { employerId: filters.employerId } : {}),
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
  };

  const sessions = await prisma.gameSession.findMany({
    where,
    select: {
      id: true,
      status: true,
      packageNameSnapshot: true,
      priceSantim: true,
      durationMinutesSnapshot: true,
      startedAt: true,
      actualEndedAt: true,
      actualDurationSeconds: true,
      createdAt: true,
      machine: { select: { name: true, code: true } },
      employer: { select: { fullName: true } },
      payment: { select: { transactionRef: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const buckets = new Map<string, { bucket: string; sessions: number; revenueSantim: number }>();
  for (const session of sessions) {
    const key = bucketKey(session.createdAt, granularity, filters.timezone);
    const bucket = buckets.get(key) ?? { bucket: key, sessions: 0, revenueSantim: 0 };
    bucket.sessions += 1;
    bucket.revenueSantim += session.priceSantim;
    buckets.set(key, bucket);
  }

  const completed = sessions.filter((session) => session.actualDurationSeconds !== null);
  const statusCounts = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.status] = (acc[session.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    meta: reportMeta(filters, granularity),
    totals: {
      sessions: sessions.length,
      revenueSantim: sessions.reduce((sum, session) => sum + session.priceSantim, 0),
      averageDurationSeconds:
        completed.length > 0
          ? Math.round(
              completed.reduce((sum, session) => sum + (session.actualDurationSeconds ?? 0), 0) /
                completed.length,
            )
          : 0,
      byStatus: statusCounts,
    },
    series: Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
    items: sessions.slice(0, 200),
  };
}

export async function getExpenseReport(filters: ReportFilters, granularity: Granularity = 'day') {
  const expenses = await prisma.expense.findMany({
    where: {
      businessId: filters.businessId,
      deletedAt: null,
      expenseDate: { gte: filters.from, lte: filters.to },
    },
    include: { recordedBy: { select: { fullName: true } } },
    orderBy: { expenseDate: 'desc' },
  });

  const buckets = new Map<string, { bucket: string; amountSantim: number; count: number }>();
  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    const key = bucketKey(expense.expenseDate, granularity, filters.timezone);
    const bucket = buckets.get(key) ?? { bucket: key, amountSantim: 0, count: 0 };
    bucket.amountSantim += expense.amountSantim;
    bucket.count += 1;
    buckets.set(key, bucket);
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountSantim);
  }

  return {
    meta: reportMeta(filters, granularity),
    totals: {
      expensesSantim: expenses.reduce((sum, expense) => sum + expense.amountSantim, 0),
      count: expenses.length,
    },
    series: Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
    byCategory: Array.from(byCategory.entries())
      .map(([category, amountSantim]) => ({ category, amountSantim }))
      .sort((a, b) => b.amountSantim - a.amountSantim),
    items: expenses.slice(0, 200),
  };
}

export async function getProfitLossReport(filters: ReportFilters, granularity: Granularity = 'day') {
  const [revenue, expenses] = await Promise.all([
    getRevenueReport(filters, granularity),
    getExpenseReport(filters, granularity),
  ]);

  const seriesMap = new Map<string, { bucket: string; revenueSantim: number; expensesSantim: number; profitSantim: number }>();
  for (const point of revenue.series) {
    seriesMap.set(point.bucket, {
      bucket: point.bucket,
      revenueSantim: point.revenueSantim,
      expensesSantim: 0,
      profitSantim: point.revenueSantim,
    });
  }
  for (const point of expenses.series) {
    const entry =
      seriesMap.get(point.bucket) ??
      { bucket: point.bucket, revenueSantim: 0, expensesSantim: 0, profitSantim: 0 };
    entry.expensesSantim += point.amountSantim;
    entry.profitSantim = entry.revenueSantim - entry.expensesSantim;
    seriesMap.set(point.bucket, entry);
  }

  const totalExpenses = expenses.totals.expensesSantim;
  return {
    meta: reportMeta(filters, granularity),
    totals: {
      revenueSantim: revenue.totals.revenueSantim,
      expensesSantim: totalExpenses,
      profitSantim: revenue.totals.revenueSantim - totalExpenses,
      marginPercent:
        revenue.totals.revenueSantim > 0
          ? Math.round(((revenue.totals.revenueSantim - totalExpenses) / revenue.totals.revenueSantim) * 10000) / 100
          : 0,
    },
    series: Array.from(seriesMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
    expenseBreakdown: expenses.byCategory,
  };
}
