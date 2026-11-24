import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Eye, Timer } from 'lucide-react';
import { listSessions } from '../services/sessions';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader, SectionCard, SearchInput, StatCard } from '../components/ui/Layout';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { PaymentStatusBadge, SessionStatusBadge } from '../components/ui/Badge';
import { Countdown } from '../components/Countdown';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { SessionDetailModal } from '../components/SessionDetailModal';
import { errorMessage, formatDateTime, formatDuration, formatEtb, humanize } from '../lib/utils';
import type { SessionStatus } from '../types';

export function SessionsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [status, setStatus] = useState<SessionStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setPage(1), [debouncedSearch, status, from, to]);

  const query = useQuery({
    queryKey: ['sessions', { search: debouncedSearch, status, from, to, page }],
    queryFn: () =>
      listSessions({
        search: debouncedSearch || undefined,
        status: status || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        page,
        pageSize: 15,
      }),
    refetchInterval: 30_000,
  });

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  const activeCount = items.filter((session) => ['ACTIVE', 'PAUSED'].includes(session.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Game Sessions"
        subtitle="Every rental session, payment and countdown — kept permanently"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Sessions on this page"
          value={items.length}
          icon={<CalendarClock className="h-5 w-5" />}
          tone="navy"
        />
        <StatCard label="Active / paused" value={activeCount} icon={<Timer className="h-5 w-5" />} tone="blue" />
        <StatCard
          label="Session revenue"
          value={formatEtb(query.data?.summary.sessionRevenueSantim ?? 0)}
          tone="green"
        />
      </div>

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search machine or payment ref..."
              className="sm:max-w-xs"
            />
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as SessionStatus | '')}
              className="sm:max-w-44"
              aria-label="Filter by session status"
            >
              <option value="">All statuses</option>
              {['ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED', 'CANCELLED'].map((value) => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="sm:max-w-40"
              aria-label="From date"
            />
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="sm:max-w-40"
              aria-label="To date"
            />
          </div>
          <p className="text-xs text-navy-500">{meta ? `${meta.total} sessions` : '—'}</p>
        </div>

        {query.isLoading ? (
          <TableSkeleton columns={7} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-6 w-6" />}
            title="No sessions found"
            description="Sessions appear here as soon as an employer starts a paid rental."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Machine / Package</th>
                  <th className="th">Employer</th>
                  <th className="th">Started</th>
                  <th className="th">Ends</th>
                  <th className="th">Duration</th>
                  <th className="th">Payment</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {items.map((session) => (
                  <tr key={session.id} className="hover:bg-navy-50/50">
                    <td className="td">
                      <p className="font-semibold text-navy-900">{session.machine.name}</p>
                      <p className="text-xs text-navy-500">
                        {session.machine.code} • {session.packageName}
                      </p>
                    </td>
                    <td className="td">{session.employer.fullName}</td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(session.startedAt)}</td>
                    <td className="td whitespace-nowrap text-xs">
                      {['ACTIVE', 'PAUSED'].includes(session.status) ? (
                        <Countdown
                          endsAt={session.endsAt}
                          serverTime={query.data?.serverTime}
                          status={session.status}
                        />
                      ) : (
                        formatDateTime(session.actualEndedAt ?? session.endsAt)
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      {formatDuration(session.actualDurationSeconds ?? session.elapsedSeconds)}
                    </td>
                    <td className="td">
                      <p className="text-sm font-semibold">{formatEtb(session.priceSantim)}</p>
                      <PaymentStatusBadge status={session.payment.status} />
                    </td>
                    <td className="td">
                      <SessionStatusBadge status={session.status} />
                    </td>
                    <td className="td text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Eye className="h-3.5 w-3.5" />}
                        onClick={() => setSelected(session.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta ? <Pagination meta={meta} onPageChange={setPage} /> : null}
      </SectionCard>

      <SessionDetailModal sessionId={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
