import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Clock3, Pause, Play, PlusCircle, Square, Timer } from 'lucide-react';
import { toast } from 'sonner';
import {
  cancelSession,
  endSession,
  extendSession,
  getSession,
  pauseSession,
  resumeSession,
} from '../services/sessions';
import { getMachine } from '../services/machines';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge, PaymentStatusBadge, SessionStatusBadge } from './ui/Badge';
import { DetailRow } from './ui/Layout';
import { Countdown } from './Countdown';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { LoadingState } from './ui/States';
import { errorMessage, formatDateTime, formatDuration, formatEtb, humanize } from '../lib/utils';

type ConfirmAction = 'end' | 'cancel' | null;

export function SessionDetailModal({
  sessionId,
  open,
  onClose,
}: {
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState('');

  const query = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: open && !!sessionId,
  });

  const session = query.data?.session;

  const packagesQuery = useQuery({
    queryKey: ['machine-packages', session?.machine.id],
    queryFn: () => getMachine(session!.machine.id),
    enabled: extendOpen && !!session?.machine.id,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['live'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const pauseMutation = useMutation({
    mutationFn: () => pauseSession(sessionId!),
    onSuccess: () => {
      toast.success('Session paused');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeSession(sessionId!),
    onSuccess: () => {
      toast.success('Session resumed');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const endMutation = useMutation({
    mutationFn: ({ reason, cancel }: { reason: string; cancel: boolean }) =>
      cancel ? cancelSession(sessionId!, reason) : endSession(sessionId!, reason),
    onSuccess: (_data, variables) => {
      toast.success(variables.cancel ? 'Session cancelled' : 'Session ended');
      setConfirmAction(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const extendMutation = useMutation({
    mutationFn: () =>
      extendSession(sessionId!, selectedPackage, crypto.randomUUID()),
    onSuccess: () => {
      toast.success('Session extended and extension payment recorded');
      setExtendOpen(false);
      setSelectedPackage('');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canExtend = session && ['ACTIVE', 'PAUSED'].includes(session.status);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Session details"
        description={session ? `${session.machine.name} • ${session.machine.code}` : undefined}
        size="lg"
        footer={
          session && ['ACTIVE', 'PAUSED'].includes(session.status) ? (
            <>
              {session.status === 'ACTIVE' ? (
                <Button
                  variant="secondary"
                  icon={<Pause className="h-4 w-4" />}
                  loading={pauseMutation.isPending}
                  onClick={() => pauseMutation.mutate()}
                >
                  Pause
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  icon={<Play className="h-4 w-4" />}
                  loading={resumeMutation.isPending}
                  onClick={() => resumeMutation.mutate()}
                >
                  Resume
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<PlusCircle className="h-4 w-4" />}
                onClick={() => setExtendOpen(true)}
                disabled={!canExtend}
              >
                Extend
              </Button>
              <Button
                variant="ghost"
                icon={<Ban className="h-4 w-4" />}
                onClick={() => setConfirmAction('cancel')}
              >
                Cancel session
              </Button>
              <Button
                variant="danger"
                icon={<Square className="h-4 w-4" />}
                onClick={() => setConfirmAction('end')}
              >
                End session
              </Button>
            </>
          ) : null
        }
      >
        {query.isLoading ? (
          <LoadingState label="Loading session" />
        ) : !session ? (
          <p className="py-8 text-center text-sm text-danger-600">{errorMessage(query.error)}</p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl bg-navy-900 px-4 py-5 text-center text-white">
              <p className="text-[11px] font-semibold tracking-widest text-navy-300 uppercase">
                {session.packageName} • {session.durationMinutes} minutes
              </p>
              <Countdown
                endsAt={session.endsAt}
                serverTime={query.data?.serverTime}
                status={session.status}
                className="mt-1 text-4xl text-white"
              />
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <SessionStatusBadge status={session.status} />
                <Badge tone="blue">{formatEtb(session.priceSantim)}</Badge>
                <Badge tone="neutral">{session.payment.transactionRef}</Badge>
              </div>
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="Employer" value={session.employer.fullName} />
                <DetailRow label="Original package" value={session.packageName} />
                <DetailRow label="Started" value={formatDateTime(session.startedAt)} />
                <DetailRow label="Scheduled end" value={formatDateTime(session.endsAt)} />
                <DetailRow label="Actual end" value={formatDateTime(session.actualEndedAt)} />
                <DetailRow
                  label="Elapsed / actual"
                  value={
                    session.actualDurationSeconds !== null
                      ? formatDuration(session.actualDurationSeconds)
                      : formatDuration(session.elapsedSeconds)
                  }
                />
              </div>
              <div>
                <DetailRow label="Original payment" value={`${formatEtb(session.payment.amountSantim)} (${session.payment.transactionRef})`} />
                <DetailRow label="Total session amount" value={formatEtb(session.priceSantim)} />
                <DetailRow label="Payment status" value={<PaymentStatusBadge status={session.payment.status} />} />
                <DetailRow label="Payment method" value={humanize(session.payment.method)} />
                <DetailRow label="Paused time" value={`${session.totalPausedSeconds}s`} />
                <DetailRow label="Ended by" value={session.endedByRole ? humanize(session.endedByRole) : '—'} />
                <DetailRow label="End reason" value={session.endReason ?? '—'} />
              </div>
            </div>

            {session.extensions.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wider text-navy-500 uppercase">Extensions ({session.extensions.length})</p>
                <div className="space-y-2">
                  {session.extensions.map((extension) => (
                    <div
                      key={extension.id}
                      className="rounded-lg border border-navy-100 bg-navy-50/40 px-3 py-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-navy-900">{extension.packageName}</span>
                        <span className="font-semibold text-brand-700">
                          +{extension.durationMinutes} min • {formatEtb(extension.priceSantim)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-navy-500">
                        <span>
                          End time: {formatDateTime(extension.previousEndsAt)} → {formatDateTime(extension.newEndsAt)}
                        </span>
                        {extension.createdBy ? <span>By: {extension.createdBy.fullName}</span> : null}
                        {extension.paymentRef ? <span className="font-mono">{extension.paymentRef}</span> : null}
                        <span>Added: {formatDateTime(extension.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-navy-500 uppercase">
                <Clock3 className="h-3.5 w-3.5" /> Session timeline
              </p>
              <div className="space-y-2">
                {(query.data?.events ?? []).map((event) => (
                  <div key={event.id} className="flex items-start gap-2.5 text-xs">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <div className="flex-1">
                      <p className="font-medium text-navy-800">{humanize(event.type)}</p>
                      {event.metadata ? (
                        <p className="truncate text-[11px] text-navy-400">
                          {Object.entries(event.metadata)
                            .filter(([, value]) => value !== null && typeof value !== 'object')
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(' • ')}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-navy-400">{formatDateTime(event.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        title="Extend session"
        description="Record an additional cash payment and add the package duration to this session."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtendOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Timer className="h-4 w-4" />}
              loading={extendMutation.isPending}
              disabled={!selectedPackage}
              onClick={() => extendMutation.mutate()}
            >
              Confirm extension payment
            </Button>
          </>
        }
      >
        {packagesQuery.isLoading ? (
          <LoadingState label="Loading packages" />
        ) : (packagesQuery.data?.packages.length ?? 0) === 0 ? (
          <p className="py-4 text-sm text-navy-500">No active packages are configured for this machine.</p>
        ) : (
          <div className="space-y-2">
            {packagesQuery.data?.packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => setSelectedPackage(pkg.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                  selectedPackage === pkg.id
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-navy-200 hover:bg-navy-50'
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold text-navy-900">{pkg.name}</span>
                  <span className="text-xs text-navy-500">{pkg.durationMinutes} minutes</span>
                </span>
                <span className="text-sm font-bold text-navy-900">{formatEtb(pkg.priceSantim)}</span>
              </button>
            ))}
            <p className="pt-1 text-xs text-navy-500">
              The employer must collect the cash shown above. An extension payment record is created
              immediately and can never be edited afterwards.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction === 'cancel' ? 'Cancel this session?' : 'End this session?'}
        description={
          confirmAction === 'cancel'
            ? 'The session will be marked cancelled and the machine released. Payments remain recorded for auditing.'
            : 'The session will be marked completed and the machine released. The original payment is preserved.'
        }
        confirmLabel={confirmAction === 'cancel' ? 'Cancel session' : 'End session'}
        loading={endMutation.isPending}
        onClose={() => setConfirmAction(null)}
        onConfirm={(reason) =>
          endMutation.mutate({ reason, cancel: confirmAction === 'cancel' })
        }
        requireReason
        reasonLabel="Reason"
      />
    </>
  );
}
