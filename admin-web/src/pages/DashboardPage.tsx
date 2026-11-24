import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Clock3,
  Gamepad2,
  Plus,
  ReceiptText,
  Timer,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { getDashboard } from '../services/dashboard';
import { formatDateTime, formatEtb, formatNumber, humanize } from '../lib/utils';
import { PageHeader, SectionCard, StatCard, Avatar } from '../components/ui/Layout';
import { Badge, MachineStatusBadge, PaymentStatusBadge, SessionStatusBadge } from '../components/ui/Badge';
import { RevenueChart, SimpleBars } from '../components/charts/RevenueChart';
import { Countdown } from '../components/Countdown';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States';
import { Button } from '../components/ui/Button';
import { errorMessage } from '../lib/utils';

export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30_000,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Live business overview" />
        <LoadingState label="Loading your business snapshot" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Live business overview" />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const data = query.data;
  const occupancy =
    data.machines.total > 0 ? Math.round((data.machines.inUse / data.machines.total) * 100) : 0;

  const chartData = data.revenueSeries.map((point) => ({
    label: new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: data.business.timezone,
    }).format(new Date(`${point.date}T12:00:00Z`)),
    revenueSantim: point.revenueSantim,
    sessions: point.sessions,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${data.business.name} • Live snapshot for ${new Intl.DateTimeFormat('en-GB', {
          timeZone: data.business.timezone,
          dateStyle: 'long',
        }).format(new Date())}`}
        actions={
          <>
            <Link to="/live">
              <Button variant="secondary" icon={<Timer className="h-4 w-4" />}>
                Live monitor
              </Button>
            </Link>
            <Link to="/machines?new=1">
              <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                Add machine
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue today"
          value={formatEtb(data.revenue.todaySantim)}
          hint={`${data.revenue.todayTransactions} cash transactions`}
          icon={<Wallet className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="This month"
          value={formatEtb(data.revenue.monthSantim)}
          hint={`Profit ${formatEtb(data.finance.profitMonthSantim)} after ${formatEtb(
            data.finance.expensesMonthSantim,
          )} expenses`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="Active sessions"
          value={formatNumber(data.sessions.active)}
          hint={`${data.sessions.today} started today`}
          icon={<Clock3 className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Machines in use"
          value={`${data.machines.inUse} / ${data.machines.total}`}
          hint={`${data.machines.available} available • ${occupancy}% occupancy`}
          icon={<Gamepad2 className="h-5 w-5" />}
          tone="navy"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="This week"
          value={formatEtb(data.revenue.weekSantim)}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="navy"
          loading={false}
        />
        <StatCard label="This year" value={formatEtb(data.revenue.yearSantim)} tone="navy" />
        <StatCard
          label="Employers"
          value={`${data.employers.active} active`}
          hint={`${data.employers.total} total accounts`}
          icon={<Users className="h-5 w-5" />}
          tone="purple"
        />
        <StatCard
          label="Average session"
          value={`${data.sessions.averageDurationMinutes} min`}
          hint={`${formatNumber(data.sessions.total)} sessions recorded`}
          icon={<Timer className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Revenue trend"
          description="Last 14 days of collected cash payments"
          actions={
            <Link to="/reports" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Open reports
            </Link>
          }
        >
          {chartData.length > 0 ? (
            <RevenueChart data={chartData} height={300} />
          ) : (
            <EmptyState title="No revenue yet" description="Cash payments will appear here as soon as sessions start." />
          )}
        </SectionCard>

        <SectionCard title="Machine availability" description="Current fleet status">
          <SimpleBars
            data={[
              {
                label: 'Available',
                value: data.machines.available,
                caption: `${data.machines.available} machines`,
              },
              { label: 'In use', value: data.machines.inUse, caption: `${data.machines.inUse} machines` },
              {
                label: 'Maintenance',
                value: data.machines.maintenance,
                caption: `${data.machines.maintenance} machines`,
              },
              {
                label: 'Inactive',
                value: data.machines.inactive,
                caption: `${data.machines.inactive} machines`,
              },
            ]}
          />
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link
              to="/live"
              className="rounded-lg border border-navy-200 px-3 py-2 text-center text-xs font-semibold text-navy-700 transition hover:bg-navy-50"
            >
              Live monitor
            </Link>
            <Link
              to="/machines"
              className="rounded-lg border border-navy-200 px-3 py-2 text-center text-xs font-semibold text-navy-700 transition hover:bg-navy-50"
            >
              All machines
            </Link>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Top machines this month" description="Highest revenue generators" padded={false}>
          {data.topMachines.length === 0 ? (
            <EmptyState title="No machine revenue yet" description="Start a session to see performance here." />
          ) : (
            <div className="divide-y divide-navy-100">
              {data.topMachines.map((machine, index) => (
                <div key={machine.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-100 text-xs font-bold text-navy-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900">{machine.name}</p>
                    <p className="text-xs text-navy-500">
                      {machine.code} • {machine.sessions} sessions
                    </p>
                  </div>
                  <p className="text-sm font-bold text-navy-900">{formatEtb(machine.revenueSantim)}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Top employers this month" description="Cash collected per employer" padded={false}>
          {data.topEmployers.length === 0 ? (
            <EmptyState title="No employer activity yet" description="Employer collections will be ranked here." />
          ) : (
            <div className="divide-y divide-navy-100">
              {data.topEmployers.map((employer) => (
                <div key={employer.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={employer.fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900">{employer.fullName}</p>
                    <p className="text-xs text-navy-500">
                      @{employer.username} • {employer.transactions} transactions
                    </p>
                  </div>
                  <p className="text-sm font-bold text-navy-900">{formatEtb(employer.revenueSantim)}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Recent cash transactions"
        description="Latest payments recorded by employers"
        padded={false}
        actions={
          <Link to="/payments" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            View all
          </Link>
        }
      >
        {data.recentPayments.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="When an employer confirms a cash payment it will show up here immediately."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Machine</th>
                  <th className="th">Employer</th>
                  <th className="th">Amount</th>
                  <th className="th">Status</th>
                  <th className="th">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {data.recentPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-navy-50/50">
                    <td className="td font-mono text-xs">{payment.transactionRef}</td>
                    <td className="td">
                      <span className="font-medium text-navy-900">{payment.machine.name}</span>
                      <span className="ml-1 text-xs text-navy-400">{payment.machine.code}</span>
                    </td>
                    <td className="td">{payment.employer.fullName}</td>
                    <td className="td font-semibold">{formatEtb(payment.amountSantim)}</td>
                    <td className="td">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                    <td className="td whitespace-nowrap text-xs text-navy-500">
                      {formatDateTime(payment.paidAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Recent sessions"
          description="Newest game sessions across all machines"
          padded={false}
          actions={
            <Link to="/sessions" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all
            </Link>
          }
        >
          {data.recentSessions.length === 0 ? (
            <EmptyState title="No sessions yet" description="Sessions appear once an employer starts a game." />
          ) : (
            <div className="divide-y divide-navy-100">
              {data.recentSessions.slice(0, 6).map((session) => (
                <div key={session.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-600">
                    <Gamepad2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900">
                      {session.machine.name}{' '}
                      <span className="text-xs font-normal text-navy-400">{session.machine.code}</span>
                    </p>
                    <p className="text-xs text-navy-500">
                      {session.packageName} • {session.employer.fullName}
                    </p>
                  </div>
                  <div className="text-right">
                    <SessionStatusBadge status={session.status} />
                    <p className="mt-1 text-xs text-navy-500">
                      {session.status === 'ACTIVE' || session.status === 'PAUSED' ? (
                        <Countdown
                          endsAt={session.endsAt}
                          serverTime={data.serverTime}
                          status={session.status}
                        />
                      ) : (
                        formatDateTime(session.createdAt)
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Machine overview"
          description="Tap a machine to inspect or manage it"
          padded={false}
          actions={
            <Link to="/live" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Live monitor
            </Link>
          }
        >
          {data.machineOverview.length === 0 ? (
            <EmptyState
              title="No machines registered"
              description="Add your first gaming machine to start renting."
              action={
                <Link to="/machines?new=1">
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                    Add machine
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
              {data.machineOverview.slice(0, 6).map((machine) => (
                <Link
                  key={machine.id}
                  to={`/machines/${machine.id}`}
                  className="rounded-lg border border-navy-100 p-3 transition hover:border-brand-300 hover:bg-brand-50/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-900">{machine.name}</p>
                      <p className="text-xs text-navy-500">{machine.code}</p>
                    </div>
                    <MachineStatusBadge status={machine.status} />
                  </div>
                  {machine.activeSession ? (
                    <p className="mt-2 flex items-center gap-1 text-xs text-navy-500">
                      <Clock3 className="h-3 w-3" />
                      <Countdown
                        endsAt={machine.activeSession.endsAt}
                        serverTime={data.serverTime}
                        status={machine.activeSession.status}
                      />{' '}
                      remaining
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-navy-400">{humanize(machine.status)}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-navy-900">Need a quick overview of the floor?</p>
          <p className="text-xs text-navy-500">
            The live monitor shows every machine, current employer, package and countdown.
          </p>
        </div>
        <Link to="/live">
          <Button variant="brand" icon={<ArrowUpRight className="h-4 w-4" />}>
            Open live monitor
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-navy-500">
        <Badge tone="green" dot>
          Total collected: {formatEtb(data.revenue.allTimeSantim)}
        </Badge>
        <Badge tone="blue">Refunded today: {formatEtb(data.revenue.refundedTodaySantim)}</Badge>
        <Badge tone="neutral">Unread alerts: {data.notifications.unread}</Badge>
      </div>
    </div>
  );
}
