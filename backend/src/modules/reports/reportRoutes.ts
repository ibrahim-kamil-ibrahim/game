import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate, requireRole } from '../../middleware/auth';
import { parseDateRange } from '../../utils/time';
import { formatEtb } from '../../utils/money';
import {
  getEmployerReport,
  getExpenseReport,
  getMachineReport,
  getPackageReport,
  getProfitLossReport,
  getRevenueReport,
  getSessionsReport,
  type Granularity,
  type ReportFilters,
} from '../../services/reportService';
import { toCsv, toExcel, toPdf, type ExportDataset } from '../../services/exportService';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

const baseQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  granularity: z.enum(['day', 'week', 'month', 'year']).default('day'),
  machineId: z.string().uuid().optional(),
  employerId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
});

async function buildFilters(req: import('express').Request): Promise<{
  filters: ReportFilters;
  granularity: Granularity;
}> {
  const query = req.query as never as {
    from?: string;
    to?: string;
    granularity: Granularity;
    machineId?: string;
    employerId?: string;
    packageId?: string;
    status?: string;
  };
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: req.user!.businessId },
    select: { timezone: true },
  });
  const range = parseDateRange({
    from: query.from,
    to: query.to,
    timezone: business.timezone,
    defaultDays: 30,
  });

  return {
    filters: {
      businessId: req.user!.businessId,
      from: range.from,
      to: range.to,
      timezone: range.timezone,
      machineId: query.machineId,
      employerId: query.employerId,
      packageId: query.packageId,
      status: query.status,
    },
    granularity: query.granularity ?? 'day',
  };
}

function formatRangeLabel(filters: ReportFilters): string {
  const from = filters.from.toISOString().slice(0, 10);
  const to = filters.to.toISOString().slice(0, 10);
  return `${from} to ${to} (${filters.timezone})`;
}

router.get(
  '/revenue',
  validate({ query: baseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters, granularity } = await buildFilters(req);
    const data = await getRevenueReport(filters, granularity);
    res.json({ success: true, data });
  }),
);

router.get(
  '/machines',
  validate({ query: baseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters } = await buildFilters(req);
    const data = await getMachineReport(filters);
    res.json({ success: true, data });
  }),
);

router.get(
  '/employers',
  validate({ query: baseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters } = await buildFilters(req);
    const data = await getEmployerReport(filters);
    res.json({ success: true, data });
  }),
);

router.get(
  '/packages',
  validate({ query: baseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters } = await buildFilters(req);
    const data = await getPackageReport(filters);
    res.json({ success: true, data });
  }),
);

router.get(
  '/sessions',
  validate({ query: baseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters, granularity } = await buildFilters(req);
    const data = await getSessionsReport(filters, granularity);
    res.json({ success: true, data });
  }),
);

router.get(
  '/expenses',
  validate({ query: baseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters, granularity } = await buildFilters(req);
    const data = await getExpenseReport(filters, granularity);
    res.json({ success: true, data });
  }),
);

router.get(
  '/profit-loss',
  validate({ query: baseQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters, granularity } = await buildFilters(req);
    const data = await getProfitLossReport(filters, granularity);
    res.json({ success: true, data });
  }),
);

const exportQuerySchema = baseQuerySchema.extend({
  type: z.enum(['revenue', 'machines', 'employers', 'packages', 'sessions', 'expenses', 'profit-loss']),
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
});

router.get(
  '/export',
  validate({ query: exportQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filters, granularity } = await buildFilters(req);
    const query = req.query as never as {
      type: 'revenue' | 'machines' | 'employers' | 'packages' | 'sessions' | 'expenses' | 'profit-loss';
      format: 'csv' | 'xlsx' | 'pdf';
    };
    const subtitle = `${formatRangeLabel(filters)} • Generated ${new Date().toISOString()}`;

    let dataset: ExportDataset;

    if (query.type === 'revenue') {
      const report = await getRevenueReport(filters, granularity);
      dataset = {
        title: 'Revenue Report',
        subtitle,
        summary: [
          { label: 'Total revenue', value: formatEtb(report.totals.revenueSantim) },
          { label: 'Transactions', value: String(report.totals.transactions) },
          { label: 'Average transaction', value: formatEtb(report.totals.averageTransactionSantim) },
          { label: 'Refunded', value: formatEtb(report.totals.refundedSantim) },
        ],
        columns: [
          { header: 'Period', key: 'bucket', width: 18 },
          { header: 'Revenue (ETB)', key: 'revenue', width: 18 },
          { header: 'Transactions', key: 'transactions', width: 14 },
        ],
        rows: report.series.map((point) => ({
          bucket: point.bucket,
          revenue: (point.revenueSantim / 100).toFixed(2),
          transactions: point.transactions,
        })),
      };
    } else if (query.type === 'machines') {
      const report = await getMachineReport(filters);
      dataset = {
        title: 'Machine Performance Report',
        subtitle,
        summary: [
          { label: 'Total revenue', value: formatEtb(report.totals.revenueSantim) },
          { label: 'Sessions', value: String(report.totals.sessions) },
        ],
        columns: [
          { header: 'Machine', key: 'name', width: 24 },
          { header: 'Code', key: 'code', width: 12 },
          { header: 'Category', key: 'category', width: 16 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Sessions', key: 'sessions', width: 10 },
          { header: 'Revenue (ETB)', key: 'revenue', width: 14 },
          { header: 'Avg minutes', key: 'avgMinutes', width: 12 },
        ],
        rows: report.items.map((item) => ({
          name: item.name,
          code: item.code,
          category: item.category ?? '',
          status: item.status,
          sessions: item.sessions,
          revenue: (item.revenueSantim / 100).toFixed(2),
          avgMinutes: Math.round(item.averageDurationSeconds / 60),
        })),
      };
    } else if (query.type === 'employers') {
      const report = await getEmployerReport(filters);
      dataset = {
        title: 'Employer Performance Report',
        subtitle,
        summary: [
          { label: 'Cash collected', value: formatEtb(report.totals.collectedSantim) },
          { label: 'Sessions', value: String(report.totals.sessions) },
        ],
        columns: [
          { header: 'Employer', key: 'name', width: 24 },
          { header: 'Username', key: 'username', width: 16 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Sessions', key: 'sessions', width: 10 },
          { header: 'Transactions', key: 'transactions', width: 12 },
          { header: 'Collected (ETB)', key: 'collected', width: 16 },
        ],
        rows: report.items.map((item) => ({
          name: item.fullName,
          username: item.username,
          status: item.status,
          sessions: item.sessions,
          transactions: item.transactions,
          collected: (item.collectedSantim / 100).toFixed(2),
        })),
      };
    } else if (query.type === 'packages') {
      const report = await getPackageReport(filters);
      dataset = {
        title: 'Package Performance Report',
        subtitle,
        summary: [
          { label: 'Revenue', value: formatEtb(report.totals.revenueSantim) },
          { label: 'Sessions', value: String(report.totals.sessions) },
        ],
        columns: [
          { header: 'Package', key: 'name', width: 24 },
          { header: 'Duration (min)', key: 'duration', width: 14 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Sessions', key: 'sessions', width: 10 },
          { header: 'Transactions', key: 'transactions', width: 12 },
          { header: 'Revenue (ETB)', key: 'revenue', width: 16 },
        ],
        rows: report.items.map((item) => ({
          name: item.name,
          duration: item.durationMinutes,
          status: item.status,
          sessions: item.sessions,
          transactions: item.transactions,
          revenue: (item.revenueSantim / 100).toFixed(2),
        })),
      };
    } else if (query.type === 'sessions') {
      const report = await getSessionsReport(filters, granularity);
      dataset = {
        title: 'Session History Report',
        subtitle,
        summary: [
          { label: 'Sessions', value: String(report.totals.sessions) },
          { label: 'Session revenue', value: formatEtb(report.totals.revenueSantim) },
          { label: 'Average duration', value: `${Math.round(report.totals.averageDurationSeconds / 60)} min` },
        ],
        columns: [
          { header: 'Started', key: 'started', width: 20 },
          { header: 'Machine', key: 'machine', width: 20 },
          { header: 'Employer', key: 'employer', width: 18 },
          { header: 'Package', key: 'package', width: 18 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Price (ETB)', key: 'price', width: 12 },
          { header: 'Payment ref', key: 'paymentRef', width: 20 },
        ],
        rows: report.items.map((item) => ({
          started: item.startedAt ? item.startedAt.toISOString() : '',
          machine: `${item.machine.name} (${item.machine.code})`,
          employer: item.employer.fullName,
          package: item.packageNameSnapshot,
          status: item.status,
          price: (item.priceSantim / 100).toFixed(2),
          paymentRef: item.payment.transactionRef,
        })),
      };
    } else if (query.type === 'expenses') {
      const report = await getExpenseReport(filters, granularity);
      dataset = {
        title: 'Expense Report',
        subtitle,
        summary: [
          { label: 'Total expenses', value: formatEtb(report.totals.expensesSantim) },
          { label: 'Entries', value: String(report.totals.count) },
        ],
        columns: [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Title', key: 'title', width: 26 },
          { header: 'Category', key: 'category', width: 18 },
          { header: 'Amount (ETB)', key: 'amount', width: 14 },
          { header: 'Recorded by', key: 'recordedBy', width: 18 },
        ],
        rows: report.items.map((item) => ({
          date: item.expenseDate.toISOString().slice(0, 10),
          title: item.title,
          category: item.category,
          amount: (item.amountSantim / 100).toFixed(2),
          recordedBy: item.recordedBy.fullName,
        })),
      };
    } else {
      const report = await getProfitLossReport(filters, granularity);
      dataset = {
        title: 'Profit and Loss Report',
        subtitle,
        summary: [
          { label: 'Revenue', value: formatEtb(report.totals.revenueSantim) },
          { label: 'Expenses', value: formatEtb(report.totals.expensesSantim) },
          { label: 'Net profit', value: formatEtb(report.totals.profitSantim) },
          { label: 'Margin', value: `${report.totals.marginPercent}%` },
        ],
        columns: [
          { header: 'Period', key: 'bucket', width: 18 },
          { header: 'Revenue (ETB)', key: 'revenue', width: 16 },
          { header: 'Expenses (ETB)', key: 'expenses', width: 16 },
          { header: 'Profit (ETB)', key: 'profit', width: 16 },
        ],
        rows: report.series.map((point) => ({
          bucket: point.bucket,
          revenue: (point.revenueSantim / 100).toFixed(2),
          expenses: (point.expensesSantim / 100).toFixed(2),
          profit: (point.profitSantim / 100).toFixed(2),
        })),
      };
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${query.type}-report-${stamp}.${query.format}`;

    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(toCsv(dataset));
      return;
    }
    if (query.format === 'xlsx') {
      const buffer = await toExcel(dataset);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }
    const buffer = await toPdf(dataset);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }),
);

export default router;
