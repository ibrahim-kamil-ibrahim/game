import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, HandCoins, MoreVertical, ReceiptText, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { getPayment, listPayments, refundPayment, voidPayment } from '../services/payments';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader, SectionCard, SearchInput, StatCard, DetailRow } from '../components/ui/Layout';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge, PaymentStatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { errorMessage, formatDateTime, formatEtb, humanize } from '../lib/utils';
import type { PaymentStatus, PaymentType } from '../types';

type PaymentAction = { type: 'void' | 'refund'; id: string; reference: string } | null;

export function PaymentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [type, setType] = useState<PaymentType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<PaymentAction>(null);

  useEffect(() => setPage(1), [debouncedSearch, status, type, from, to]);

  const query = useQuery({
    queryKey: ['payments', { search: debouncedSearch, status, type, from, to, page }],
    queryFn: () =>
      listPayments({
        search: debouncedSearch || undefined,
        status: status || undefined,
        type: type || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        page,
        pageSize: 15,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ['payment', selected],
    queryFn: () => getPayment(selected!),
    enabled: !!selected,
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, type: actionType, reason }: { id: string; type: 'void' | 'refund'; reason: string }) =>
      actionType === 'void' ? voidPayment(id, reason) : refundPayment(id, reason),
    onSuccess: (_data, variables) => {
      toast.success(variables.type === 'void' ? 'Payment voided' : 'Payment refunded');
      setAction(null);
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['payment', selected] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Transactions"
        subtitle="Every cash payment recorded by employers — immutable financial history"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Collected (filtered)"
          value={formatEtb(query.data?.summary.collectedSantim ?? 0)}
          icon={<Wallet className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Paid transactions"
          value={query.data?.summary.paidTransactions ?? 0}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard label="Transactions on this page" value={items.length} icon={<HandCoins className="h-5 w-5" />} tone="navy" />
      </div>

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Reference, machine..."
              className="sm:max-w-xs"
            />
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as PaymentStatus | '')}
              className="sm:max-w-40"
              aria-label="Filter by payment status"
            >
              <option value="">All statuses</option>
              <option value="PAID">Paid</option>
              <option value="REFUNDED">Refunded</option>
              <option value="VOIDED">Voided</option>
            </Select>
            <Select
              value={type}
              onChange={(event) => setType(event.target.value as PaymentType | '')}
              className="sm:max-w-40"
              aria-label="Filter by payment type"
            >
              <option value="">All types</option>
              <option value="RENTAL">Rental</option>
              <option value="EXTENSION">Extension</option>
            </Select>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="sm:max-w-40" aria-label="From date" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="sm:max-w-40" aria-label="To date" />
          </div>
          <p className="text-xs text-navy-500">{meta ? `${meta.total} transactions` : '—'}</p>
        </div>

        {query.isLoading ? (
          <TableSkeleton columns={8} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="No transactions found"
            description="Cash payments recorded by employers will appear here instantly."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Machine</th>
                  <th className="th">Employer</th>
                  <th className="th">Package</th>
                  <th className="th">Amount</th>
                  <th className="th">Type</th>
                  <th className="th">Status</th>
                  <th className="th">Paid at</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {items.map((payment) => (
                  <tr key={payment.id} className="hover:bg-navy-50/50">
                    <td className="td font-mono text-[11px]">{payment.transactionRef}</td>
                    <td className="td">
                      <p className="font-medium text-navy-900">{payment.machine.name}</p>
                      <p className="text-xs text-navy-500">{payment.machine.code}</p>
                    </td>
                    <td className="td">{payment.employer.fullName}</td>
                    <td className="td">
                      <p className="text-sm">{payment.packageName}</p>
                      <p className="text-xs text-navy-500">{payment.durationMinutes} min</p>
                    </td>
                    <td className="td font-semibold whitespace-nowrap">{formatEtb(payment.amountSantim)}</td>
                    <td className="td">
                      <Badge tone={payment.type === 'EXTENSION' ? 'purple' : 'neutral'}>
                        {humanize(payment.type)}
                      </Badge>
                    </td>
                    <td className="td">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(payment.paidAt)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-icon"
                          title="View payment"
                          aria-label={`View payment ${payment.transactionRef}`}
                          onClick={() => setSelected(payment.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {payment.status === 'PAID' ? (
                          <details className="relative">
                            <summary className="btn-icon cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                              <MoreVertical className="h-4 w-4" />
                            </summary>
                            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-navy-200 bg-white py-1 shadow-xl">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-navy-700 hover:bg-navy-50"
                                onClick={() =>
                                  setAction({ type: 'refund', id: payment.id, reference: payment.transactionRef })
                                }
                              >
                                <Undo2 className="h-3.5 w-3.5" /> Refund payment
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 border-t border-navy-100 px-3 py-2 text-left text-xs text-danger-600 hover:bg-danger-50"
                                onClick={() =>
                                  setAction({ type: 'void', id: payment.id, reference: payment.transactionRef })
                                }
                              >
                                <Wallet className="h-3.5 w-3.5" /> Void payment
                              </button>
                            </div>
                          </details>
                        ) : null}
                      </div>
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
        title="Payment details"
        description={detail?.transactionRef}
        size="md"
        footer={
          detail?.status === 'PAID' ? (
            <>
              <Button
                variant="secondary"
                icon={<Undo2 className="h-4 w-4" />}
                onClick={() => {
                  setAction({ type: 'refund', id: detail.id, reference: detail.transactionRef });
                  setSelected(null);
                }}
              >
                Refund
              </Button>
              <Button
                variant="danger"
                icon={<Wallet className="h-4 w-4" />}
                onClick={() => {
                  setAction({ type: 'void', id: detail.id, reference: detail.transactionRef });
                  setSelected(null);
                }}
              >
                Void payment
              </Button>
            </>
          ) : null
        }
      >
        {detailQuery.isLoading ? (
          <LoadingState />
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-navy-900 px-4 py-4 text-white">
              <div>
                <p className="text-[11px] font-semibold tracking-widest text-navy-300 uppercase">Amount</p>
                <p className="text-2xl font-bold">{formatEtb(detail.amountSantim)}</p>
              </div>
              <PaymentStatusBadge status={detail.status} />
            </div>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="Transaction reference" value={detail.transactionRef} />
                <DetailRow label="Machine" value={`${detail.machine.name} (${detail.machine.code})`} />
                <DetailRow label="Employer" value={detail.employer.fullName} />
                <DetailRow label="Package" value={`${detail.packageName} • ${detail.durationMinutes} min`} />
                <DetailRow label="Type" value={humanize(detail.type)} />
              </div>
              <div>
                <DetailRow label="Payment method" value={humanize(detail.method)} />
                <DetailRow label="Paid at" value={formatDateTime(detail.paidAt)} />
                <DetailRow label="Session" value={detail.sessionId ? 'Linked session' : 'Not started'} />
                <DetailRow label="Refunded at" value={formatDateTime(detail.refundedAt)} />
                <DetailRow label="Voided at" value={formatDateTime(detail.voidedAt)} />
                <DetailRow label="Reason" value={detail.voidReason ?? '—'} />
              </div>
            </div>
            {detail.notes ? (
              <p className="rounded-lg bg-navy-50 px-3.5 py-2.5 text-xs text-navy-600">{detail.notes}</p>
            ) : null}
            <p className="text-[11px] leading-5 text-navy-400">
              Payments are never deleted. Voiding reverses an unstarted payment; refunds reverse a completed
              sale. Both actions are permanently audited.
            </p>
          </div>
        ) : (
          <p className="text-sm text-danger-600">{errorMessage(detailQuery.error)}</p>
        )}
      </Modal>

      <ConfirmDialog
        open={!!action}
        title={action?.type === 'void' ? 'Void this payment?' : 'Refund this payment?'}
        description={
          action?.type === 'void'
            ? `Payment ${action?.reference} will be marked voided. Only use this when the session never started and the customer has been given their cash back.`
            : `Payment ${action?.reference} will be marked refunded and removed from recognised revenue. Record a reason for the audit trail.`
        }
        confirmLabel={action?.type === 'void' ? 'Void payment' : 'Refund payment'}
        loading={actionMutation.isPending}
        onClose={() => setAction(null)}
        onConfirm={(reason) =>
          action && actionMutation.mutate({ id: action.id, type: action.type, reason })
        }
        requireReason
        reasonLabel="Reason"
      />
    </div>
  );
}
