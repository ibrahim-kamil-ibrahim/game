import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  KeyRound,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createEmployer,
  listEmployers,
  resetEmployerPassword,
  setEmployerStatus,
  updateEmployer,
} from '../services/employers';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader, SectionCard, SearchInput, StatCard, Avatar } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { UserStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { EmployerFormModal } from '../components/EmployerFormModal';
import { CredentialsModal, type CredentialSet } from '../components/CredentialsModal';
import {
  copyText,
  errorMessage,
  formatDateTime,
  formatEtb,
  generateEmployerPassword,
} from '../lib/utils';
import type { EmployerListItem, UserStatus } from '../types';

export function EmployersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployerListItem | null>(null);
  const [resetTarget, setResetTarget] = useState<EmployerListItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialSet | null>(null);
  const [credentialsTitle, setCredentialsTitle] = useState('Employer account created');

  useEffect(() => setPage(1), [debouncedSearch, status]);

  const query = useQuery({
    queryKey: ['employers', { search: debouncedSearch, status, page }],
    queryFn: () =>
      listEmployers({
        search: debouncedSearch || undefined,
        status: status || undefined,
        page,
        pageSize: 15,
      }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['employers'] });

  const createMutation = useMutation({
    mutationFn: createEmployer,
    onSuccess: (employer) => {
      setFormOpen(false);
      setCredentialsTitle('Employer account created');
      setCredentials({
        fullName: employer.fullName,
        username: employer.username,
        password: employer.temporaryPassword,
      });
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { fullName: string; username: string; phone?: string } }) =>
      updateEmployer(id, values),
    onSuccess: (employer) => {
      toast.success(`${employer.fullName} updated`);
      setFormOpen(false);
      setEditing(null);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['employer', employer.id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: UserStatus }) => setEmployerStatus(id, next),
    onSuccess: (employer) => {
      toast.success(`${employer.fullName} is now ${employer.status.toLowerCase()}`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetEmployerPassword(id, password),
    onSuccess: (result) => {
      const previous = resetTarget;
      setResetTarget(null);
      setCredentialsTitle('Password reset');
      setCredentials({
        fullName: previous?.fullName ?? result.username,
        username: result.username,
        password: result.temporaryPassword,
      });
      invalidate();
      if (previous) void queryClient.invalidateQueries({ queryKey: ['employer', previous.id] });
    },
    onError: (error) => setResetError(errorMessage(error)),
  });

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employer Management"
        subtitle="Create accounts, control access and monitor cash collections"
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Create employer
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Employers on this page"
          value={items.length}
          icon={<Users className="h-5 w-5" />}
          tone="navy"
        />
        <StatCard
          label="Active"
          value={items.filter((employer) => employer.status === 'ACTIVE').length}
          tone="green"
        />
        <StatCard
          label="Collected today"
          value={formatEtb(items.reduce((sum, employer) => sum + employer.todayRevenueSantim, 0))}
          tone="blue"
        />
      </div>

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, username, phone..."
              className="sm:max-w-sm"
            />
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as UserStatus | '')}
              className="sm:max-w-44"
              aria-label="Filter by account status"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
          </div>
          <p className="text-xs text-navy-500">{meta ? `${meta.total} employers` : '—'}</p>
        </div>

        {query.isLoading ? (
          <TableSkeleton columns={6} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No employers yet"
            description="Create employer accounts so staff can operate machines through the mobile app."
            action={
              <Button variant="primary" onClick={() => setFormOpen(true)}>
                Create employer
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Employer</th>
                  <th className="th">Status</th>
                  <th className="th">Last login</th>
                  <th className="th">Sessions</th>
                  <th className="th">Today</th>
                  <th className="th">Total collected</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {items.map((employer) => (
                  <tr key={employer.id} className="hover:bg-navy-50/50">
                    <td className="td">
                      <Link to={`/employers/${employer.id}`} className="flex items-center gap-3">
                        <Avatar name={employer.fullName} size="sm" />
                        <span>
                          <span className="block font-semibold text-navy-900">{employer.fullName}</span>
                          <span className="block text-xs text-navy-500">
                            @{employer.username}
                            {employer.phone ? ` • ${employer.phone}` : ''}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="td">
                      <UserStatusBadge status={employer.status} />
                    </td>
                    <td className="td text-xs">{formatDateTime(employer.lastLoginAt)}</td>
                    <td className="td">{employer.sessionsCount}</td>
                    <td className="td font-medium">{formatEtb(employer.todayRevenueSantim)}</td>
                    <td className="td font-semibold">{formatEtb(employer.totalRevenueSantim)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/employers/${employer.id}`}
                          className="btn-icon"
                          title="View employer"
                          aria-label={`View ${employer.fullName}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Edit employer"
                          onClick={() => {
                            setEditing(employer);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <details className="relative">
                          <summary className="btn-icon cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <MoreVertical className="h-4 w-4" />
                          </summary>
                          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-navy-200 bg-white py-1 shadow-xl">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-navy-700 hover:bg-navy-50"
                              onClick={() => {
                                setResetTarget(employer);
                                setNewPassword(generateEmployerPassword());
                                setResetError(null);
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" /> Reset password
                            </button>
                            <button
                              type="button"
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                                employer.status === 'ACTIVE'
                                  ? 'text-danger-600 hover:bg-danger-50'
                                  : 'text-success-600 hover:bg-success-50'
                              }`}
                              onClick={() =>
                                statusMutation.mutate({
                                  id: employer.id,
                                  next: employer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                                })
                              }
                            >
                              <Power className="h-3.5 w-3.5" />
                              {employer.status === 'ACTIVE' ? 'Suspend access' : 'Reactivate account'}
                            </button>
                          </div>
                        </details>
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

      <EmployerFormModal
        open={formOpen}
        employer={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={async (values) => {
          if (editing) {
            await updateMutation.mutateAsync({
              id: editing.id,
              values: { fullName: values.fullName, username: values.username, phone: values.phone },
            });
          } else {
            await createMutation.mutateAsync({
              fullName: values.fullName,
              username: values.username,
              phone: values.phone,
              password: values.password ?? '',
            });
          }
        }}
      />

      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Reset employer password"
        description={`Generate a new password for ${resetTarget?.fullName ?? 'this employer'}. All their sessions will be signed out.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={resetMutation.isPending}
              onClick={() => {
                if (resetTarget) resetMutation.mutate({ id: resetTarget.id, password: newPassword });
              }}
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNewPassword(generateEmployerPassword())}
            >
              Regenerate
            </Button>
          </div>
          <p className="text-xs text-navy-500">
            Share the new password securely. It remains copyable on the employer detail page until the
            employer signs in.
          </p>
        </div>
      </Modal>

      <CredentialsModal
        open={!!credentials}
        credentials={credentials}
        title={credentialsTitle}
        description={
          credentialsTitle === 'Password reset'
            ? 'Share the new credentials with the employer.'
            : 'Share these credentials with the employer securely.'
        }
        onClose={() => setCredentials(null)}
      />
    </div>
  );
}
