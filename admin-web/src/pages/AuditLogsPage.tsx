import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, ScrollText } from 'lucide-react';
import { listAuditLogs } from '../services/audit';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader, SearchInput, SectionCard, StatCard } from '../components/ui/Layout';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { errorMessage, formatDateTime, humanize } from '../lib/utils';
import type { AuditLogItem } from '../types';

export function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLogItem | null>(null);

  useEffect(() => setPage(1), [debouncedSearch, action, entityType, from, to]);

  const query = useQuery({
    queryKey: ['audit-logs', { search: debouncedSearch, action, entityType, from, to, page }],
    queryFn: () =>
      listAuditLogs({
        search: debouncedSearch || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        page,
        pageSize: 20,
      }),
  });

  const entityTypes = Array.from(new Set((query.data?.items ?? []).map((item) => item.entityType)));
  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        subtitle="Immutable record of sensitive administrative and financial activity"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Audit records (filtered)"
          value={meta?.total ?? 0}
          icon={<ScrollText className="h-5 w-5" />}
          tone="navy"
        />
        <StatCard label="Actions tracked" value={query.data?.filters.actions.length ?? 0} tone="blue" />
        <StatCard label="Records on this page" value={items.length} tone="green" />
      </div>

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="Search action or user..." className="sm:max-w-xs" />
            <Select value={action} onChange={(event) => setAction(event.target.value)} className="sm:max-w-56" aria-label="Filter by action">
              <option value="">All actions</option>
              {(query.data?.filters.actions ?? []).map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </Select>
            <Select value={entityType} onChange={(event) => setEntityType(event.target.value)} className="sm:max-w-48" aria-label="Filter by entity">
              <option value="">All entities</option>
              {entityTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="sm:max-w-40" aria-label="From date" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="sm:max-w-40" aria-label="To date" />
          </div>
          <p className="text-xs text-navy-500">{meta ? `${meta.total} records` : '—'}</p>
        </div>

        {query.isLoading ? (
          <TableSkeleton columns={6} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-6 w-6" />}
            title="No audit records"
            description="Sensitive actions such as price changes, refunds and session overrides appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Timestamp</th>
                  <th className="th">User</th>
                  <th className="th">Action</th>
                  <th className="th">Entity</th>
                  <th className="th">IP address</th>
                  <th className="th text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {items.map((log) => (
                  <tr key={log.id} className="hover:bg-navy-50/50">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</td>
                    <td className="td">
                      <p className="text-sm font-medium text-navy-900">{log.user?.fullName ?? 'System'}</p>
                      <p className="text-xs text-navy-500">{log.actorRole ? humanize(log.actorRole) : 'Automated'}</p>
                    </td>
                    <td className="td">
                      <Badge tone={log.action.includes('DELETE') || log.action.includes('VOID') || log.action.includes('REFUND') ? 'red' : log.action.includes('CREATE') || log.action.includes('LOGIN') ? 'green' : 'blue'}>
                        {humanize(log.action)}
                      </Badge>
                    </td>
                    <td className="td text-xs">
                      {log.entityType}
                      {log.entityId ? <span className="block font-mono text-[10px] text-navy-400">{log.entityId.slice(0, 18)}…</span> : null}
                    </td>
                    <td className="td text-xs">{log.ip ?? '—'}</td>
                    <td className="td text-right">
                      <button type="button" className="btn-icon" onClick={() => setSelected(log)} aria-label="View audit details">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta ? <Pagination meta={meta} onPageChange={setPage} /> : null}
      </SectionCard>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Audit record"
        description={selected ? `${humanize(selected.action)} • ${formatDateTime(selected.createdAt)}` : undefined}
        size="lg"
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-navy-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-navy-500 uppercase">Actor</p>
                <p className="mt-0.5 font-medium text-navy-900">{selected.user?.fullName ?? 'System'}</p>
                <p className="text-xs text-navy-500">{selected.user ? `@${selected.user.username}` : selected.actorRole ?? 'Automated'}</p>
              </div>
              <div className="rounded-lg bg-navy-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-navy-500 uppercase">Affected record</p>
                <p className="mt-0.5 font-medium text-navy-900">{selected.entityType}</p>
                <p className="font-mono text-[11px] break-all text-navy-500">{selected.entityId ?? '—'}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-navy-500 uppercase">Previous values</p>
                <pre className="max-h-72 overflow-auto rounded-lg bg-navy-900 p-3 text-[11px] leading-5 text-navy-100">
                  {selected.before ? JSON.stringify(selected.before, null, 2) : '—'}
                </pre>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-navy-500 uppercase">New values</p>
                <pre className="max-h-72 overflow-auto rounded-lg bg-navy-900 p-3 text-[11px] leading-5 text-navy-100">
                  {selected.after ? JSON.stringify(selected.after, null, 2) : '—'}
                </pre>
              </div>
            </div>
            <div className="text-xs text-navy-500">
              IP: {selected.ip ?? '—'} • User agent: {selected.userAgent ?? '—'}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
