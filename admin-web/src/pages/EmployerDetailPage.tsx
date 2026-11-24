import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Eye, EyeOff, KeyRound, Pencil, Power, Wallet, Gamepad2, Clock3, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  getEmployer,
  getEmployerActivity,
  resetEmployerPassword,
  setEmployerStatus,
  updateEmployer,
} from '../services/employers';
import { PageHeader, SectionCard, StatCard, Tabs, Avatar, DetailRow } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge, PaymentStatusBadge, SessionStatusBadge, UserStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState, TableSkeleton } from '../components/ui/States';
import { EmployerFormModal } from '../components/EmployerFormModal';
import { CredentialsModal, type CredentialSet } from '../components/CredentialsModal';
import {
  copyText,
  errorMessage,
  formatDateTime,
  formatEtb,
  formatNumber,
  generateEmployerPassword,
} from '../lib/utils';

type Tab = 'sessions' | 'payments' | 'activity';

export function EmployerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('sessions');
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);
  const [resetCredentials, setResetCredentials] = useState<CredentialSet | null>(null);

  const query = useQuery({
    queryKey: ['employer', id],
    queryFn: () => getEmployer(id),
    enabled: !!id,
  });

  const activityQuery = useQuery({
    queryKey: ['employer-activity', id],
    queryFn: () => getEmployerActivity(id, { page: 1, pageSize: 20 }),
    enabled: !!id,
  });

  useEffect(() => {
    if (resetOpen) setNewPassword(generateEmployerPassword());
    setResetError(null);
  }, [resetOpen]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['employer', id] });
    void queryClient.invalidateQueries({ queryKey: ['employer-activity', id] });
    void queryClient.invalidateQueries({ queryKey: ['employers'] });
  };

  const updateMutation = useMutation({
    mutationFn: (values: { fullName: string; username: string; phone?: string }) =>
      updateEmployer(id, values),
    onSuccess: () => {
      toast.success('Employer updated');
      setEditOpen(false);
      invalidate();
    },
  });

  const statusMutation = useMutation({
    mutationFn: (next: 'ACTIVE' | 'SUSPENDED') => setEmployerStatus(id, next),
    onSuccess: (employer) => {
      toast.success(`${employer.fullName} is now ${employer.status.toLowerCase()}`);
      setConfirmStatus(false);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const resetMutation = useMutation({
    mutationFn: (password: string) => resetEmployerPassword(id, password),
    onSuccess: (result) => {
      setResetOpen(false);
      setResetCredentials({
        fullName: query.data?.employer.fullName ?? result.username,
        username: result.username,
        password: result.temporaryPassword,
      });
      invalidate();
    },
    onError: (error) => setResetError(errorMessage(error)),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employer" />
        <LoadingState />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Employer"
          actions={
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/employers')}>
              Back
            </Button>
          }
        />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const { employer, stats, credentials } = query.data;
  const activity = activityQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/employers" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-navy-500 hover:text-navy-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to employers
        </Link>
        <PageHeader
          title={employer.fullName}
          subtitle={`@${employer.username}${employer.phone ? ` • ${employer.phone}` : ''}`}
          actions={
            <>
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                Edit profile
              </Button>
              <Button
                variant="secondary"
                icon={<KeyRound className="h-4 w-4" />}
                onClick={() => setResetOpen(true)}
              >
                Reset password
              </Button>
              <Button
                variant={employer.status === 'ACTIVE' ? 'danger' : 'primary'}
                icon={<Power className="h-4 w-4" />}
                onClick={() => setConfirmStatus(true)}
              >
                {employer.status === 'ACTIVE' ? 'Suspend access' : 'Reactivate'}
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected today"
          value={formatEtb(stats.revenueTodaySantim)}
          icon={<Wallet className="h-5 w-5" />}
          tone="green"
        />
        <StatCard label="Total collected" value={formatEtb(stats.revenueTotalSantim)} tone="blue" />
        <StatCard
          label="Sessions today"
          value={formatNumber(stats.sessionsToday)}
          hint={`${stats.sessionsTotal} total sessions`}
          icon={<Gamepad2 className="h-5 w-5" />}
          tone="navy"
        />
        <StatCard
          label="Active sessions"
          value={formatNumber(stats.activeSessions)}
          icon={<Clock3 className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <SectionCard title="Account details">
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={employer.fullName} size="lg" />
              <div>
                <p className="text-sm font-semibold text-navy-900">{employer.fullName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <UserStatusBadge status={employer.status} />
                  <Badge tone="neutral">Employer</Badge>
                </div>
              </div>
            </div>
            <DetailRow label="Username" value={`@${employer.username}`} />
            <DetailRow label="Phone" value={employer.phone ?? '—'} />
            <DetailRow label="Last login" value={formatDateTime(employer.lastLoginAt)} />
            <DetailRow label="Account created" value={formatDateTime(employer.createdAt)} />
            <DetailRow label="Last updated" value={formatDateTime(employer.updatedAt)} />
          </SectionCard>

          <SectionCard
            title="Sign-in credentials"
            description="Visible to administrators only"
          >
            <div className="rounded-lg border border-navy-200 bg-navy-50 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-wider text-navy-500 uppercase">
                  Username
                </span>
                <button
                  type="button"
                  className="btn-icon h-7 w-7"
                  aria-label="Copy username"
                  onClick={async () => {
                    const ok = await copyText(employer.username);
                    if (ok) toast.success('Username copied');
                    else toast.error('Could not copy to the clipboard');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 font-mono text-sm font-semibold break-all text-navy-900">
                {employer.username}
              </p>
            </div>

            {credentials?.temporaryPassword ? (
              <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold tracking-wider text-brand-700 uppercase">
                    Temporary password
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn-icon h-7 w-7"
                      onClick={() => setRevealPassword((value) => !value)}
                      aria-label={revealPassword ? 'Hide password' : 'Show password'}
                    >
                      {revealPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-icon h-7 w-7"
                      aria-label="Copy password"
                      onClick={async () => {
                        const ok = await copyText(credentials.temporaryPassword!);
                        if (ok) toast.success('Password copied');
                        else toast.error('Could not copy to the clipboard');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-sm font-semibold break-all text-navy-900">
                  {revealPassword ? credentials.temporaryPassword : '••••••••••••'}
                </p>
                <p className="mt-1 text-[11px] text-brand-600">
                  Generated {formatDateTime(credentials.setAt)}. Available until the employer signs in for
                  the first time.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    const text = [
                      'GameZone Employer sign-in',
                      `Name: ${employer.fullName}`,
                      `Username: ${credentials.username}`,
                      `Temporary password: ${credentials.temporaryPassword}`,
                    ].join('\n');
                    const ok = await copyText(text);
                    if (ok) toast.success('Credentials copied');
                    else toast.error('Could not copy to the clipboard');
                  }}
                >
                  Copy credentials
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning-50 px-3.5 py-3 text-[11px] leading-5 text-warning-600">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No temporary password available. It is cleared after the employer's first sign-in. Use
                  reset below to generate a new one.
                </span>
              </div>
            )}

            <Button
              variant="secondary"
              icon={<KeyRound className="h-4 w-4" />}
              className="mt-4 w-full"
              onClick={() => setResetOpen(true)}
            >
              Reset password
            </Button>
          </SectionCard>
        </div>

        <SectionCard className="xl:col-span-2" padded={false}>
          <div className="border-b border-navy-100 p-4">
            <Tabs
              tabs={[
                { id: 'sessions', label: 'Sessions', count: activity?.sessions.meta.total },
                { id: 'payments', label: 'Cash collections', count: activity?.payments.meta.total },
                { id: 'activity', label: 'Activity log' },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>

          {activityQuery.isLoading ? (
            <TableSkeleton columns={5} />
          ) : tab === 'sessions' ? (
            activity?.sessions.items.length ? (
              <div className="divide-y divide-navy-100">
                {activity.sessions.items.map((session) => (
                  <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900">
                        {session.machine.name}{' '}
                        <span className="text-xs font-normal text-navy-400">{session.machine.code}</span>
                      </p>
                      <p className="text-xs text-navy-500">
                        {session.packageNameSnapshot} • {formatEtb(session.priceSantim)} •{' '}
                        {formatDateTime(session.createdAt)}
                      </p>
                    </div>
                    <SessionStatusBadge status={session.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No sessions yet" description="This employer has not operated any machines." />
            )
          ) : tab === 'payments' ? (
            activity?.payments.items.length ? (
              <div className="divide-y divide-navy-100">
                {activity.payments.items.map((payment) => (
                  <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900">{formatEtb(payment.amountSantim)}</p>
                      <p className="text-xs text-navy-500">
                        {payment.machine.name} • {payment.packageNameSnapshot} • {formatDateTime(payment.paidAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-navy-400">{payment.transactionRef}</span>
                      <PaymentStatusBadge status={payment.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No cash collections" description="Payments recorded by this employer appear here." />
            )
          ) : activity?.auditLogs.length ? (
            <div className="divide-y divide-navy-100">
              {activity.auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-navy-900">{log.action.replaceAll('_', ' ')}</p>
                    <p className="text-xs text-navy-500">
                      {log.entityType} {log.entityId ? `• ${log.entityId.slice(0, 8)}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-navy-400">{formatDateTime(log.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No activity recorded yet" />
          )}
        </SectionCard>
      </div>

      <EmployerFormModal
        open={editOpen}
        employer={{
          id: employer.id,
          fullName: employer.fullName,
          username: employer.username,
          phone: employer.phone,
          status: employer.status,
          lastLoginAt: employer.lastLoginAt,
          createdAt: employer.createdAt,
          sessionsCount: stats.sessionsTotal,
          totalRevenueSantim: stats.revenueTotalSantim,
          todayRevenueSantim: stats.revenueTodaySantim,
        }}
        onClose={() => setEditOpen(false)}
        onSubmit={async (values) => {
          await updateMutation.mutateAsync({
            fullName: values.fullName,
            username: values.username,
            phone: values.phone,
          });
        }}
      />

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset employer password"
        description="The employer will be signed out of all devices and must use the new password."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={resetMutation.isPending}
              onClick={() => resetMutation.mutate(newPassword)}
            >
              Generate & reset
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {resetError ? (
            <div className="rounded-lg border border-danger-500/25 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
              {resetError}
            </div>
          ) : null}
          <div className="rounded-lg border border-navy-200 bg-navy-50 px-3.5 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-navy-500 uppercase">
              New temporary password
            </p>
            <p className="mt-1 font-mono text-sm font-semibold break-all text-navy-900">{newPassword}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const ok = await copyText(newPassword);
                if (ok) toast.success('Password copied');
                else toast.error('Could not copy to the clipboard');
              }}
            >
              Copy password
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewPassword(generateEmployerPassword())}>
              Regenerate
            </Button>
          </div>
          <p className="text-xs text-navy-500">
            The employer is signed out of all devices. The new password remains copyable here until their
            first sign-in.
          </p>
        </div>
      </Modal>

      <CredentialsModal
        open={!!resetCredentials}
        credentials={resetCredentials}
        title="Password reset"
        description="Share the new credentials with the employer."
        onClose={() => setResetCredentials(null)}
      />

      <Modal
        open={confirmStatus}
        onClose={() => setConfirmStatus(false)}
        title={employer.status === 'ACTIVE' ? 'Suspend this employer?' : 'Reactivate this employer?'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmStatus(false)}>
              Cancel
            </Button>
            <Button
              variant={employer.status === 'ACTIVE' ? 'danger' : 'primary'}
              loading={statusMutation.isPending}
              onClick={() => statusMutation.mutate(employer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
            >
              {employer.status === 'ACTIVE' ? 'Suspend access' : 'Reactivate'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-navy-600">
          {employer.status === 'ACTIVE'
            ? 'The employer will be signed out immediately and cannot log in until reactivated. Their historical records are preserved.'
            : 'The employer will be able to log in and operate machines again.'}
        </p>
      </Modal>
    </div>
  );
}
