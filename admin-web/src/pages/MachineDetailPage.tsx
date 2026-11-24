import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  Gamepad2,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getMachine,
  getMachineHistory,
  getMachineStats,
  setMachineStatus,
  updateMachine,
} from '../services/machines';
import { listCategories } from '../services/categories';
import { PageHeader, SectionCard, StatCard, Tabs, DetailRow } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Badge, MachineStatusBadge, PaymentStatusBadge, SessionStatusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { MachineFormModal, type MachineFormValues } from '../components/MachineFormModal';
import { QRCodeModal } from '../components/QRCodeModal';
import { RevenueChart } from '../components/charts/RevenueChart';
import { errorMessage, formatDateTime, formatDuration, formatEtb, formatNumber } from '../lib/utils';
import type { MachineStatus } from '../types';

type Tab = 'overview' | 'history' | 'analytics';

export function MachineDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [qrOpen, setQrOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Exclude<MachineStatus, 'IN_USE'> | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const machineQuery = useQuery({
    queryKey: ['machine', id],
    queryFn: () => getMachine(id),
    enabled: !!id,
  });

  const historyQuery = useQuery({
    queryKey: ['machine-history', id, historyPage],
    queryFn: () => getMachineHistory(id, { page: historyPage, pageSize: 15 }),
    enabled: !!id,
  });

  const statsQuery = useQuery({
    queryKey: ['machine-stats', id],
    queryFn: () => getMachineStats(id),
    enabled: !!id,
  });

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: listCategories });

  const updateMutation = useMutation({
    mutationFn: (values: MachineFormValues) =>
      updateMachine(id, {
        ...values,
        categoryId: values.categoryId || null,
        description: values.description ?? null,
        brand: values.brand ?? null,
        model: values.model ?? null,
        serialNumber: values.serialNumber ?? null,
        location: values.location ?? null,
        imageUrl: values.imageUrl ?? null,
      }),
    onSuccess: () => {
      toast.success('Machine updated');
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['machine', id] });
      void queryClient.invalidateQueries({ queryKey: ['machines'] });
      void queryClient.invalidateQueries({ queryKey: ['live'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (next: Exclude<MachineStatus, 'IN_USE'>) => setMachineStatus(id, next),
    onSuccess: (machine) => {
      toast.success(`Machine is now ${machine.status.replace('_', ' ').toLowerCase()}`);
      setStatusTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['machine', id] });
      void queryClient.invalidateQueries({ queryKey: ['machines'] });
      void queryClient.invalidateQueries({ queryKey: ['live'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (machineQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Machine" subtitle="Loading machine details" />
        <LoadingState />
      </div>
    );
  }

  if (machineQuery.isError || !machineQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Machine"
          actions={
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/machines')}>
              Back
            </Button>
          }
        />
        <ErrorState message={errorMessage(machineQuery.error)} onRetry={() => void machineQuery.refetch()} />
      </div>
    );
  }

  const { machine, packages, stats, recentSessions } = machineQuery.data;
  const daily = statsQuery.data?.daily ?? [];
  const chart = daily.map((point) => ({
    label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(
      new Date(`${point.date}T12:00:00Z`),
    ),
    revenueSantim: point.revenueSantim,
    sessions: point.sessions,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/machines" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-navy-500 hover:text-navy-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to machines
        </Link>
        <PageHeader
          title={machine.name}
          subtitle={`${machine.code}${machine.category ? ` • ${machine.category.name}` : ''}${
            machine.location ? ` • ${machine.location}` : ''
          }`}
          actions={
            <>
              <Button variant="secondary" icon={<QrCode className="h-4 w-4" />} onClick={() => setQrOpen(true)}>
                QR code
              </Button>
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              {machine.status === 'AVAILABLE' ? (
                <Button
                  variant="secondary"
                  icon={<Wrench className="h-4 w-4" />}
                  onClick={() => setStatusTarget('MAINTENANCE')}
                >
                  Maintenance
                </Button>
              ) : machine.status === 'MAINTENANCE' ? (
                <Button
                  variant="primary"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => setStatusTarget('AVAILABLE')}
                >
                  Mark available
                </Button>
              ) : null}
              <Link to="/live">
                <Button variant="brand" icon={<CalendarClock className="h-4 w-4" />}>
                  Live monitor
                </Button>
              </Link>
            </>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <MachineStatusBadge status={machine.status} />
          {machine.activeSession ? (
            <p className="text-xs text-navy-500">
              In use by <span className="font-semibold text-navy-800">{machine.activeSession.employer.fullName}</span>
            </p>
          ) : (
            <p className="text-xs text-navy-500">No active session</p>
          )}
        </div>
        <StatCard
          label="Total revenue"
          value={formatEtb(stats.revenueSantim)}
          icon={<Gamepad2 className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Sessions"
          value={formatNumber(stats.sessionsTotal)}
          icon={<CalendarClock className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="Average duration"
          value={formatDuration(statsQuery.data?.totals.averageDurationSeconds ?? 0)}
          icon={<Clock3 className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'history', label: 'Rental history', count: stats.sessionsTotal },
          { id: 'analytics', label: 'Usage analytics' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard title="Equipment details">
            <div className="space-y-0">
              <DetailRow label="Name" value={machine.name} />
              <DetailRow label="Code" value={machine.code} />
              <DetailRow label="Category" value={machine.category?.name ?? '—'} />
              <DetailRow label="Brand" value={machine.brand ?? '—'} />
              <DetailRow label="Model" value={machine.model ?? '—'} />
              <DetailRow label="Serial number" value={machine.serialNumber ?? '—'} />
              <DetailRow label="Location" value={machine.location ?? '—'} />
              <DetailRow label="QR version" value={machine.qr ? `v${machine.qr.version}` : '—'} />
              <DetailRow label="Registered" value={formatDateTime(machine.createdAt)} />
              <DetailRow label="Last updated" value={formatDateTime(machine.updatedAt)} />
            </div>
            {machine.description ? (
              <p className="mt-4 rounded-lg bg-navy-50 px-3.5 py-3 text-xs leading-5 text-navy-600">
                {machine.description}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Applicable packages"
            description="Only these packages can be sold for this machine"
            padded={false}
          >
            {packages.length === 0 ? (
              <EmptyState
                icon={<Plus className="h-6 w-6" />}
                title="No packages available"
                description="Create a global, category or machine-specific package so employers can rent this machine."
                action={
                  <Link to="/packages">
                    <Button variant="primary">Manage packages</Button>
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-navy-100">
                {packages.map((pkg) => (
                  <div key={pkg.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-900">{pkg.name}</p>
                      <p className="text-xs text-navy-500">
                        {pkg.durationMinutes} minutes • {pkg.scope === 'ALL' ? 'All machines' : pkg.scope === 'CATEGORY' ? `${pkg.categoryName ?? 'Category'}` : 'This machine'}
                      </p>
                    </div>
                    <Badge tone="blue">{formatEtb(pkg.priceSantim)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent sessions" padded={false}>
            {recentSessions.length === 0 ? (
              <EmptyState title="No rentals yet" description="Sessions for this machine will appear here." />
            ) : (
              <div className="divide-y divide-navy-100">
                {recentSessions.map((session) => (
                  <div key={session.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy-900">{session.packageNameSnapshot}</p>
                      <SessionStatusBadge status={session.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-navy-500">
                      {session.employer.fullName} • {formatEtb(session.priceSantim)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-navy-400">{formatDateTime(session.startedAt ?? session.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === 'history' ? (
        <SectionCard padded={false}>
          {historyQuery.isLoading ? (
            <TableSkeleton columns={6} />
          ) : !historyQuery.data?.items.length ? (
            <EmptyState title="No history yet" description="This machine has no recorded sessions." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-navy-50/80">
                  <tr>
                    <th className="th">Started</th>
                    <th className="th">Employer</th>
                    <th className="th">Package</th>
                    <th className="th">Status</th>
                    <th className="th">Duration</th>
                    <th className="th">Payment</th>
                    <th className="th">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {historyQuery.data.items.map((session) => (
                    <tr key={session.id} className="hover:bg-navy-50/50">
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(session.startedAt ?? session.createdAt)}</td>
                      <td className="td">{session.employer.fullName}</td>
                      <td className="td">
                        {session.packageName}
                        <span className="block text-xs text-navy-400">{session.durationMinutes} min</span>
                      </td>
                      <td className="td">
                        <SessionStatusBadge status={session.status} />
                      </td>
                      <td className="td">{formatDuration(session.actualDurationSeconds)}</td>
                      <td className="td">
                        <span className="block font-mono text-[11px]">{session.payment.transactionRef}</span>
                        <PaymentStatusBadge status={session.payment.status} />
                      </td>
                      <td className="td font-semibold">{formatEtb(session.priceSantim + session.extensions.reduce((sum, ext) => sum + ext.priceSantim, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {historyQuery.data ? (
            <Pagination meta={historyQuery.data.meta} onPageChange={setHistoryPage} />
          ) : null}
        </SectionCard>
      ) : null}

      {tab === 'analytics' ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SectionCard className="xl:col-span-2" title="Revenue by day" description="Last 30 days">
            {chart.length > 0 ? <RevenueChart data={chart} height={280} /> : <EmptyState title="No usage data yet" />}
          </SectionCard>
          <SectionCard title="Usage summary">
            <div className="space-y-0">
              <DetailRow label="Total sessions" value={formatNumber(statsQuery.data?.totals.sessions ?? 0)} />
              <DetailRow label="Total revenue" value={formatEtb(statsQuery.data?.totals.revenueSantim ?? 0)} />
              <DetailRow
                label="Average duration"
                value={formatDuration(statsQuery.data?.totals.averageDurationSeconds ?? 0)}
              />
              <DetailRow label="Timezone" value={statsQuery.data?.timezone ?? '—'} />
            </div>
          </SectionCard>
        </div>
      ) : null}

      <QRCodeModal machine={machine} open={qrOpen} onClose={() => setQrOpen(false)} />

      <MachineFormModal
        open={editOpen}
        machine={machine}
        categories={categoriesQuery.data ?? []}
        onClose={() => setEditOpen(false)}
        onSubmit={async (values) => {
          await updateMutation.mutateAsync(values);
        }}
      />

      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget === 'AVAILABLE' ? 'Mark machine available?' : 'Put machine in maintenance?'}
        description={
          statusTarget === 'AVAILABLE'
            ? 'The machine will become rentable again. Make sure any repair work is complete.'
            : 'Employers will not be able to scan or rent this machine while it is under maintenance.'
        }
        confirmLabel={statusTarget === 'AVAILABLE' ? 'Mark available' : 'Enter maintenance'}
        tone={statusTarget === 'AVAILABLE' ? 'primary' : 'danger'}
        loading={statusMutation.isPending}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => statusTarget && statusMutation.mutate(statusTarget)}
      />
    </div>
  );
}
