import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Clock3,
  Gamepad2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Timer,
  UserRound,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { getLiveMachines } from '../services/machines';
import { cancelSession, endSession, getSession, pauseSession, resumeSession } from '../services/sessions';
import { Countdown } from '../components/Countdown';
import { PageHeader, SectionCard, StatCard, Tabs, DetailRow } from '../components/ui/Layout';
import { Badge, MachineStatusBadge, SessionStatusBadge } from '../components/ui/Badge';import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { StartRentalModal } from '../components/StartRentalModal';
import { formatDateTime, formatEtb, errorMessage, humanize } from '../lib/utils';
import type { Machine, MachineStatus } from '../types';

type Filter = 'ALL' | MachineStatus;

export function LiveMonitorPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [startMachine, setStartMachine] = useState<Machine | null>(null);
  const [endTarget, setEndTarget] = useState<{ id: string; name: string; cancel?: boolean } | null>(null);

  const liveQuery = useQuery({
    queryKey: ['live'],
    queryFn: getLiveMachines,
    refetchInterval: 10_000,
  });

  const sessionQuery = useQuery({
    queryKey: ['session', inspectId],
    queryFn: () => getSession(inspectId!),
    enabled: !!inspectId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['live'] });
    void queryClient.invalidateQueries({ queryKey: ['session', inspectId] });
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const pauseMutation = useMutation({
    mutationFn: (id: string) => pauseSession(id),
    onSuccess: () => {
      toast.success('Session paused');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => resumeSession(id),
    onSuccess: () => {
      toast.success('Session resumed');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const endMutation = useMutation({
    mutationFn: ({ id, reason, cancel }: { id: string; reason: string; cancel?: boolean }) =>
      cancel ? cancelSession(id, reason) : endSession(id, reason),
    onSuccess: (_data, variables) => {
      toast.success(variables.cancel ? 'Session cancelled' : 'Session ended');
      setEndTarget(null);
      setInspectId(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (liveQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Live Monitoring" subtitle="Real-time floor overview" />
        <LoadingState label="Connecting to the live floor" />
      </div>
    );
  }

  if (liveQuery.isError || !liveQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Live Monitoring" subtitle="Real-time floor overview" />
        <ErrorState message={errorMessage(liveQuery.error)} onRetry={() => void liveQuery.refetch()} />
      </div>
    );
  }

  const data = liveQuery.data;
  const machines =
    filter === 'ALL' ? data.machines : data.machines.filter((machine) => machine.status === filter);
  const session = sessionQuery.data?.session;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Monitoring"
        subtitle="Every machine, current employer and countdown — refreshed automatically"
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw className={`h-4 w-4 ${liveQuery.isFetching ? 'animate-spin' : ''}`} />}
            onClick={() => void liveQuery.refetch()}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available"
          value={data.summary.available}
          icon={<Gamepad2 className="h-5 w-5" />}
          tone="green"
        />
        <StatCard label="In use" value={data.summary.inUse} icon={<Timer className="h-5 w-5" />} tone="blue" />
        <StatCard
          label="Maintenance"
          value={data.summary.maintenance}
          icon={<Wrench className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Inactive"
          value={data.summary.inactive}
          icon={<Square className="h-5 w-5" />}
          tone="navy"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: 'ALL', label: 'All', count: data.summary.total },
            { id: 'AVAILABLE', label: 'Available', count: data.summary.available },
            { id: 'IN_USE', label: 'In use', count: data.summary.inUse },
            { id: 'MAINTENANCE', label: 'Maintenance', count: data.summary.maintenance },
            { id: 'INACTIVE', label: 'Inactive', count: data.summary.inactive },
          ]}
          active={filter}
          onChange={setFilter}
        />
        <p className="text-xs text-navy-500">
          Server time{' '}
          <span className="font-semibold text-navy-700">
            {formatDateTime(data.serverTime)}
          </span>
        </p>
      </div>

      {machines.length === 0 ? (
        <SectionCard>
          <EmptyState
            title={filter === 'ALL' ? 'No machines registered' : `No ${humanize(filter).toLowerCase()} machines`}
            description={
              filter === 'ALL'
                ? 'Register gaming equipment to start renting sessions.'
                : 'Try a different filter to see other machines.'
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {machines.map((machine) => {
            const active = machine.activeSession;
            return (
              <div
                key={machine.id}
                className={`card flex flex-col overflow-hidden border-t-4 ${
                  machine.status === 'AVAILABLE'
                    ? 'border-t-success-500'
                    : machine.status === 'IN_USE'
                      ? 'border-t-brand-500'
                      : machine.status === 'MAINTENANCE'
                        ? 'border-t-warning-500'
                        : 'border-t-navy-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2 p-4 pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy-900">{machine.name}</p>
                    <p className="mt-0.5 text-xs text-navy-500">
                      {machine.code}
                      {machine.category ? ` • ${machine.category.name}` : ''}
                    </p>
                  </div>
                  <MachineStatusBadge status={machine.status} />
                </div>

                {active ? (
                  <div className="flex-1 space-y-3 border-t border-navy-100 bg-navy-50/40 p-4">
                    <div className="rounded-lg bg-navy-900 px-3 py-2.5 text-center text-white">
                      <p className="text-[10px] font-semibold tracking-wider text-navy-300 uppercase">
                        Remaining time
                      </p>
                      <Countdown
                        endsAt={active.endsAt}
                        serverTime={data.serverTime}
                        status={active.status}
                        className="text-3xl text-white"
                      />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <p className="flex items-center gap-2 text-navy-600">
                        <UserRound className="h-3.5 w-3.5 text-navy-400" />
                        {active.employer.fullName}
                      </p>
                      <p className="flex items-center gap-2 text-navy-600">
                        <Gamepad2 className="h-3.5 w-3.5 text-navy-400" />
                        {active.packageName}
                      </p>
                      <p className="flex items-center gap-2 text-navy-600">
                        <Clock3 className="h-3.5 w-3.5 text-navy-400" />
                        Ends {formatDateTime(active.endsAt)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge tone="blue">{formatEtb(active.priceSantim)}</Badge>
                      <SessionStatusBadge status={active.status} />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setInspectId(active.id)}
                      >
                        Inspect
                      </Button>
                      <Link to={`/machines/${machine.id}`} className="flex-1">
                        <Button size="sm" variant="ghost" className="w-full">
                          Machine
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col justify-between gap-3 p-4 pt-1">
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-navy-200 bg-navy-50/50 py-6 text-center">
                      <Gamepad2 className="h-7 w-7 text-navy-300" />
                      <p className="mt-2 text-xs font-medium text-navy-500">
                        {machine.status === 'AVAILABLE' ? 'Ready to rent' : humanize(machine.status)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Play className="h-3.5 w-3.5" />}
                        onClick={() => setStartMachine(machine)}
                      >
                        Start rental
                      </Button>
                      <Link to={`/machines/${machine.id}`}>
                        <Button size="sm" variant="secondary" className="w-full">
                          View machine
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!inspectId}
        onClose={() => setInspectId(null)}
        title="Active session"
        description="Administrative inspection of the running session"
        size="lg"
        footer={
          session ? (
            <>
              {session.status === 'ACTIVE' ? (
                <Button
                  variant="secondary"
                  icon={<Pause className="h-4 w-4" />}
                  loading={pauseMutation.isPending}
                  onClick={() => pauseMutation.mutate(session.id)}
                >
                  Pause
                </Button>
              ) : null}
              {session.status === 'PAUSED' ? (
                <Button
                  variant="secondary"
                  icon={<Play className="h-4 w-4" />}
                  loading={resumeMutation.isPending}
                  onClick={() => resumeMutation.mutate(session.id)}
                >
                  Resume
                </Button>
              ) : null}
              <Button
                variant="primary"
                icon={<Square className="h-4 w-4" />}
                onClick={() => setEndTarget({ id: session.id, name: session.machine.name })}
              >
                End session
              </Button>
            </>
          ) : null
        }
      >
        {sessionQuery.isLoading ? (
          <LoadingState label="Loading session" />
        ) : sessionQuery.isError || !session ? (
          <ErrorState message={errorMessage(sessionQuery.error)} />
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl bg-navy-900 px-4 py-5 text-center text-white">
              <p className="text-[11px] font-semibold tracking-widest text-navy-300 uppercase">
                {session.machine.name} • {session.machine.code}
              </p>
              <Countdown
                endsAt={session.endsAt}
                serverTime={sessionQuery.data?.serverTime}
                status={session.status}
                className="mt-1 text-5xl text-white"
              />
              <div className="mt-3 flex items-center justify-center gap-2">
                <SessionStatusBadge status={session.status} />
                <Badge tone="blue">{formatEtb(session.priceSantim)}</Badge>
              </div>
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="Employer" value={session.employer.fullName} />
                <DetailRow label="Package" value={session.packageName} />
                <DetailRow label="Duration" value={`${session.durationMinutes} minutes`} />
                <DetailRow label="Started" value={formatDateTime(session.startedAt)} />
                <DetailRow label="Scheduled end" value={formatDateTime(session.endsAt)} />
              </div>
              <div>
                <DetailRow label="Payment reference" value={session.payment.transactionRef} />
                <DetailRow label="Payment status" value={session.payment.status} />
                <DetailRow label="Amount" value={formatEtb(session.payment.amountSantim)} />
                <DetailRow label="Machine code" value={session.machine.code} />
                <DetailRow label="Extensions" value={session.extensions.length} />
              </div>
            </div>

            {session.extensions.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wider text-navy-500 uppercase">
                  Extensions ({session.extensions.length})
                </p>
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

            <p className="text-[11px] text-navy-400">
              Session timers are authoritative on the server. The admin dashboard displays the remaining
              time based on the server clock.
            </p>
          </div>
        )}
      </Modal>

      <StartRentalModal
        machine={startMachine}
        open={!!startMachine}
        onClose={() => setStartMachine(null)}
        onStarted={(sessionId) => setInspectId(sessionId)}
      />

      <ConfirmDialog
        open={!!endTarget}
        title="End active session?"
        description={`This will immediately end the session on ${endTarget?.name ?? 'this machine'}, mark it completed and make the machine available. The payment record is preserved.`}
        confirmLabel="End session"
        loading={endMutation.isPending}
        onClose={() => setEndTarget(null)}
        onConfirm={(reason) =>
          endTarget && endMutation.mutate({ id: endTarget.id, reason })
        }
        requireReason
        reasonLabel="Reason for ending the session"
      />
    </div>
  );
}
