import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  exportReport,
  fetchEmployerReport,
  fetchExpenseReport,
  fetchMachineReport,
  fetchPackageReport,
  fetchProfitLossReport,
  fetchRevenueReport,
  fetchSessionsReport,
  type ExportFormat,
  type ReportParams,
} from '../services/reports';
import { listMachines } from '../services/machines';
import { listEmployers } from '../services/employers';
import { listPackages } from '../services/packages';
import { useAuthStore } from '../stores/auth';
import { PageHeader, SectionCard, StatCard, Tabs } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge, PaymentStatusBadge, SessionStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { RevenueChart, SimpleBars } from '../components/charts/RevenueChart';
import { errorMessage, formatDateTime, formatDuration, formatEtb, humanize } from '../lib/utils';
import type { Granularity } from '../services/reports';

type ReportTab = 'revenue' | 'machines' | 'employers' | 'packages' | 'sessions' | 'expenses' | 'profit-loss';

const tabs: Array<{ id: ReportTab; label: string }> = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'profit-loss', label: 'Profit & Loss' },
  { id: 'machines', label: 'Machines' },
  { id: 'employers', label: 'Employers' },
  { id: 'packages', label: 'Packages' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'expenses', label: 'Expenses' },
];

function isoDaysAgo(days: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - days * 86400000));
}

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function ReportsPage() {
  const timezone = useAuthStore((state) => state.user?.business.timezone ?? 'Africa/Addis_Ababa');
  const [tab, setTab] = useState<ReportTab>('revenue');
  const [from, setFrom] = useState(() => isoDaysAgo(29, timezone));
  const [to, setTo] = useState(() => todayIn(timezone));
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [machineId, setMachineId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const filters: ReportParams = {
    from,
    to,
    granularity,
    machineId: machineId || undefined,
    employerId: employerId || undefined,
    packageId: packageId || undefined,
    status: status || undefined,
  };

  const machinesQuery = useQuery({
    queryKey: ['machines', 'report-filter'],
    queryFn: () => listMachines({ pageSize: 100 }),
    staleTime: 60_000,
  });
  const employersQuery = useQuery({
    queryKey: ['employers', 'report-filter'],
    queryFn: () => listEmployers({ pageSize: 100 }),
    staleTime: 60_000,
  });
  const packagesQuery = useQuery({
    queryKey: ['packages', 'report-filter'],
    queryFn: () => listPackages({ pageSize: 100 }),
    staleTime: 60_000,
  });

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      const { blob, filename } = await exportReport(tab, format, filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Report exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Accurate financial reporting based on recorded cash transactions and expenses"
        actions={
          <>
            <Button
              variant="secondary"
              icon={exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              onClick={() => handleExport('csv')}
              disabled={!!exporting}
            >
              CSV
            </Button>
            <Button
              variant="secondary"
              icon={exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              onClick={() => handleExport('xlsx')}
              disabled={!!exporting}
            >
              Excel
            </Button>
            <Button
              variant="primary"
              icon={exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              onClick={() => handleExport('pdf')}
              disabled={!!exporting}
            >
              PDF
            </Button>
          </>
        }
      />

      <SectionCard>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label" htmlFor="report-from">
              From
            </label>
            <Input id="report-from" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="report-to">
              To
            </label>
            <Input id="report-to" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="report-granularity">
              Group by
            </label>
            <Select
              id="report-granularity"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as Granularity)}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="report-status">
              Transaction status
            </label>
            <Select id="report-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Paid only (default)</option>
              <option value="REFUNDED">Refunded</option>
              <option value="VOIDED">Voided</option>
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="report-machine">
              Machine
            </label>
            <Select id="report-machine" value={machineId} onChange={(event) => setMachineId(event.target.value)}>
              <option value="">All machines</option>
              {machinesQuery.data?.items.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name} ({machine.code})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="report-employer">
              Employer
            </label>
            <Select id="report-employer" value={employerId} onChange={(event) => setEmployerId(event.target.value)}>
              <option value="">All employers</option>
              {employersQuery.data?.items.map((employer) => (
                <option key={employer.id} value={employer.id}>
                  {employer.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="report-package">
              Package
            </label>
            <Select id="report-package" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
              <option value="">All packages</option>
              {packagesQuery.data?.items.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => {
                setFrom(isoDaysAgo(29, timezone));
                setTo(todayIn(timezone));
                setGranularity('day');
                setMachineId('');
                setEmployerId('');
                setPackageId('');
                setStatus('');
              }}
              className="w-full"
            >
              Reset filters
            </Button>
          </div>
        </div>
      </SectionCard>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'revenue' ? <RevenueView filters={filters} /> : null}
      {tab === 'profit-loss' ? <ProfitLossView filters={filters} /> : null}
      {tab === 'machines' ? <MachinesView filters={filters} /> : null}
      {tab === 'employers' ? <EmployersView filters={filters} /> : null}
      {tab === 'packages' ? <PackagesView filters={filters} /> : null}
      {tab === 'sessions' ? <SessionsView filters={filters} /> : null}
      {tab === 'expenses' ? <ExpensesView filters={filters} /> : null}
    </div>
  );
}

function ReportError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState message={errorMessage(error)} onRetry={retry} />;
}

function RevenueView({ filters }: { filters: ReportParams }) {
  const query = useQuery({ queryKey: ['reports', 'revenue', filters], queryFn: () => fetchRevenueReport(filters) });
  if (query.isLoading) return <SectionCard><TableSkeleton /></SectionCard>;
  if (query.isError || !query.data) return <SectionCard><ReportError error={query.error} retry={() => void query.refetch()} /></SectionCard>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total revenue" value={formatEtb(data.totals.revenueSantim)} icon={<Wallet className="h-5 w-5" />} tone="green" />
        <StatCard label="Transactions" value={data.totals.transactions} icon={<BarChart3 className="h-5 w-5" />} tone="blue" />
        <StatCard label="Average transaction" value={formatEtb(data.totals.averageTransactionSantim)} tone="navy" />
        <StatCard
          label="Refunds in period"
          value={formatEtb(data.totals.refundedSantim)}
          hint={`${data.totals.refundedTransactions} refunds`}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="red"
        />
      </div>

      <SectionCard title="Revenue trend" description={`Grouped by ${data.meta.granularity} • ${data.meta.timezone}`}>
        {data.series.length ? (
          <RevenueChart
            data={data.series.map((point) => ({
              label: point.bucket,
              revenueSantim: point.revenueSantim,
              sessions: point.transactions,
            }))}
            height={300}
          />
        ) : (
          <EmptyState title="No revenue in this period" description="Adjust the filters or start a session." />
        )}
      </SectionCard>

      <SectionCard title="Revenue by period" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-navy-50/80">
              <tr>
                <th className="th">Period</th>
                <th className="th">Transactions</th>
                <th className="th text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {data.series.map((point) => (
                <tr key={point.bucket} className="hover:bg-navy-50/50">
                  <td className="td font-medium">{point.bucket}</td>
                  <td className="td">{point.transactions}</td>
                  <td className="td text-right font-semibold">{formatEtb(point.revenueSantim)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function ProfitLossView({ filters }: { filters: ReportParams }) {
  const query = useQuery({ queryKey: ['reports', 'profit', filters], queryFn: () => fetchProfitLossReport(filters) });
  if (query.isLoading) return <SectionCard><TableSkeleton /></SectionCard>;
  if (query.isError || !query.data) return <SectionCard><ReportError error={query.error} retry={() => void query.refetch()} /></SectionCard>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatEtb(data.totals.revenueSantim)} icon={<TrendingUp className="h-5 w-5" />} tone="green" />
        <StatCard label="Expenses" value={formatEtb(data.totals.expensesSantim)} icon={<TrendingDown className="h-5 w-5" />} tone="red" />
        <StatCard
          label="Net profit"
          value={formatEtb(data.totals.profitSantim)}
          tone={data.totals.profitSantim >= 0 ? 'blue' : 'red'}
        />
        <StatCard label="Profit margin" value={`${data.totals.marginPercent}%`} tone="navy" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Revenue vs expenses" description={`Grouped by ${data.meta.granularity}`}>
          {data.series.length ? (
            <RevenueChart
              data={data.series.map((point) => ({
                label: point.bucket,
                revenueSantim: point.revenueSantim,
              }))}
              height={280}
            />
          ) : (
            <EmptyState title="No financial activity" />
          )}
        </SectionCard>
        <SectionCard title="Expense breakdown">
          {data.expenseBreakdown.length ? (
            <SimpleBars
              data={data.expenseBreakdown.map((row) => ({
                label: humanize(row.category),
                value: row.amountSantim,
                caption: formatEtb(row.amountSantim),
              }))}
            />
          ) : (
            <p className="py-6 text-center text-xs text-navy-400">No expenses in this period</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Profit and loss by period" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-navy-50/80">
              <tr>
                <th className="th">Period</th>
                <th className="th text-right">Revenue</th>
                <th className="th text-right">Expenses</th>
                <th className="th text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {data.series.map((point) => (
                <tr key={point.bucket} className="hover:bg-navy-50/50">
                  <td className="td font-medium">{point.bucket}</td>
                  <td className="td text-right">{formatEtb(point.revenueSantim)}</td>
                  <td className="td text-right">{formatEtb(point.expensesSantim)}</td>
                  <td className={`td text-right font-semibold ${point.profitSantim < 0 ? 'text-danger-600' : 'text-success-600'}`}>
                    {formatEtb(point.profitSantim)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function MachinesView({ filters }: { filters: ReportParams }) {
  const query = useQuery({ queryKey: ['reports', 'machines', filters], queryFn: () => fetchMachineReport(filters) });
  if (query.isLoading) return <SectionCard><TableSkeleton /></SectionCard>;
  if (query.isError || !query.data) return <SectionCard><ReportError error={query.error} retry={() => void query.refetch()} /></SectionCard>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Machine revenue" value={formatEtb(data.totals.revenueSantim)} tone="green" />
        <StatCard label="Sessions" value={data.totals.sessions} tone="blue" />
      </div>
      <SectionCard title="Machine performance" padded={false}>
        {data.items.length === 0 ? (
          <EmptyState title="No machines" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Machine</th>
                  <th className="th">Category</th>
                  <th className="th">Status</th>
                  <th className="th">Sessions</th>
                  <th className="th">Average duration</th>
                  <th className="th text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {data.items.map((item) => (
                  <tr key={item.machineId} className="hover:bg-navy-50/50">
                    <td className="td">
                      <p className="font-semibold text-navy-900">{item.name}</p>
                      <p className="text-xs text-navy-500">{item.code}</p>
                    </td>
                    <td className="td">{item.category ?? '—'}</td>
                    <td className="td">
                      <Badge tone={item.status === 'AVAILABLE' ? 'green' : item.status === 'IN_USE' ? 'blue' : 'neutral'}>
                        {humanize(item.status)}
                      </Badge>
                    </td>
                    <td className="td">{item.sessions}</td>
                    <td className="td">{formatDuration(item.averageDurationSeconds)}</td>
                    <td className="td text-right font-semibold">{formatEtb(item.revenueSantim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function EmployersView({ filters }: { filters: ReportParams }) {
  const query = useQuery({ queryKey: ['reports', 'employers', filters], queryFn: () => fetchEmployerReport(filters) });
  if (query.isLoading) return <SectionCard><TableSkeleton /></SectionCard>;
  if (query.isError || !query.data) return <SectionCard><ReportError error={query.error} retry={() => void query.refetch()} /></SectionCard>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Cash collected" value={formatEtb(data.totals.collectedSantim)} tone="green" />
        <StatCard label="Sessions operated" value={data.totals.sessions} tone="blue" />
      </div>
      <SectionCard title="Employer performance" padded={false}>
        {data.items.length === 0 ? (
          <EmptyState title="No employers" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Employer</th>
                  <th className="th">Status</th>
                  <th className="th">Sessions</th>
                  <th className="th">Extensions</th>
                  <th className="th">Average duration</th>
                  <th className="th text-right">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {data.items.map((item) => (
                  <tr key={item.employerId} className="hover:bg-navy-50/50">
                    <td className="td">
                      <p className="font-semibold text-navy-900">{item.fullName}</p>
                      <p className="text-xs text-navy-500">@{item.username}</p>
                    </td>
                    <td className="td">
                      <Badge tone={item.status === 'ACTIVE' ? 'green' : 'red'}>{humanize(item.status)}</Badge>
                    </td>
                    <td className="td">{item.sessions}</td>
                    <td className="td">{item.extensionTransactions}</td>
                    <td className="td">{formatDuration(item.averageDurationSeconds)}</td>
                    <td className="td text-right font-semibold">{formatEtb(item.collectedSantim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function PackagesView({ filters }: { filters: ReportParams }) {
  const query = useQuery({ queryKey: ['reports', 'packages', filters], queryFn: () => fetchPackageReport(filters) });
  if (query.isLoading) return <SectionCard><TableSkeleton /></SectionCard>;
  if (query.isError || !query.data) return <SectionCard><ReportError error={query.error} retry={() => void query.refetch()} /></SectionCard>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Package revenue" value={formatEtb(data.totals.revenueSantim)} tone="green" />
        <StatCard label="Sessions sold" value={data.totals.sessions} tone="blue" />
      </div>
      <SectionCard title="Package performance" padded={false}>
        {data.items.length === 0 ? (
          <EmptyState title="No packages" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Package</th>
                  <th className="th">Duration</th>
                  <th className="th">Current price</th>
                  <th className="th">Status</th>
                  <th className="th">Sessions</th>
                  <th className="th">Transactions</th>
                  <th className="th text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {data.items.map((item) => (
                  <tr key={item.packageId} className="hover:bg-navy-50/50">
                    <td className="td font-semibold text-navy-900">{item.name}</td>
                    <td className="td">{item.durationMinutes} min</td>
                    <td className="td">{formatEtb(item.currentPriceSantim)}</td>
                    <td className="td">
                      <Badge tone={item.status === 'ACTIVE' ? 'green' : 'neutral'}>{humanize(item.status)}</Badge>
                    </td>
                    <td className="td">{item.sessions}</td>
                    <td className="td">{item.transactions}</td>
                    <td className="td text-right font-semibold">{formatEtb(item.revenueSantim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SessionsView({ filters }: { filters: ReportParams }) {
  const query = useQuery({ queryKey: ['reports', 'sessions', filters], queryFn: () => fetchSessionsReport(filters) });
  if (query.isLoading) return <SectionCard><TableSkeleton /></SectionCard>;
  if (query.isError || !query.data) return <SectionCard><ReportError error={query.error} retry={() => void query.refetch()} /></SectionCard>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sessions" value={data.totals.sessions} tone="blue" />
        <StatCard label="Session revenue" value={formatEtb(data.totals.revenueSantim)} tone="green" />
        <StatCard label="Average duration" value={formatDuration(data.totals.averageDurationSeconds)} tone="navy" />
      </div>
      <SectionCard title="Session history" description="Up to 200 sessions" padded={false}>
        {data.items.length === 0 ? (
          <EmptyState title="No sessions in this period" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Started</th>
                  <th className="th">Machine</th>
                  <th className="th">Employer</th>
                  <th className="th">Package</th>
                  <th className="th">Status</th>
                  <th className="th">Payment</th>
                  <th className="th text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {data.items.map((session) => (
                  <tr key={session.id} className="hover:bg-navy-50/50">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(session.startedAt ?? session.createdAt)}</td>
                    <td className="td">{session.machine.name}<span className="block text-xs text-navy-500">{session.machine.code}</span></td>
                    <td className="td">{session.employer.fullName}</td>
                    <td className="td">{session.packageNameSnapshot}</td>
                    <td className="td"><SessionStatusBadge status={session.status} /></td>
                    <td className="td">
                      <span className="block font-mono text-[11px]">{session.payment.transactionRef}</span>
                      <PaymentStatusBadge status={session.payment.status} />
                    </td>
                    <td className="td text-right font-semibold">{formatEtb(session.priceSantim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ExpensesView({ filters }: { filters: ReportParams }) {
  const query = useQuery({ queryKey: ['reports', 'expenses', filters], queryFn: () => fetchExpenseReport(filters) });
  if (query.isLoading) return <SectionCard><TableSkeleton /></SectionCard>;
  if (query.isError || !query.data) return <SectionCard><ReportError error={query.error} retry={() => void query.refetch()} /></SectionCard>;
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total expenses" value={formatEtb(data.totals.expensesSantim)} tone="red" />
        <StatCard label="Entries" value={data.totals.count} tone="navy" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Expense entries" padded={false}>
          {data.items.length === 0 ? (
            <EmptyState title="No expenses in this period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-navy-50/80">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Title</th>
                    <th className="th">Category</th>
                    <th className="th">Recorded by</th>
                    <th className="th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {data.items.map((expense) => (
                    <tr key={expense.id} className="hover:bg-navy-50/50">
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(expense.expenseDate)}</td>
                      <td className="td font-medium">{expense.title}</td>
                      <td className="td">{humanize(expense.category)}</td>
                      <td className="td text-xs">{expense.recordedBy.fullName}</td>
                      <td className="td text-right font-semibold">{formatEtb(expense.amountSantim)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
        <SectionCard title="By category">
          {data.byCategory.length ? (
            <SimpleBars
              data={data.byCategory.map((row) => ({
                label: humanize(row.category),
                value: row.amountSantim,
                caption: formatEtb(row.amountSantim),
              }))}
            />
          ) : (
            <p className="py-6 text-center text-xs text-navy-400">No expenses</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
