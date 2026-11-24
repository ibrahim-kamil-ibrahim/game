import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  Gamepad2,
  MoreVertical,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createMachine,
  deleteMachine,
  listMachines,
  setMachineStatus,
  updateMachine,
} from '../services/machines';
import { listCategories } from '../services/categories';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader, SectionCard, SearchInput, StatCard } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { MachineStatusBadge } from '../components/ui/Badge';
import { Pagination } from '../components/ui/Pagination';
import { MachineFormModal, type MachineFormValues } from '../components/MachineFormModal';
import { QRCodeModal } from '../components/QRCodeModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { errorMessage, formatEtb, formatNumber } from '../lib/utils';
import type { Machine, MachineStatus } from '../types';

export function MachinesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [status, setStatus] = useState<MachineStatus | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Machine | null>(null);
  const [qrMachine, setQrMachine] = useState<Machine | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, categoryId]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setFormOpen(true);
      setEditing(null);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: listCategories });

  const machinesQuery = useQuery({
    queryKey: ['machines', { search: debouncedSearch, status, categoryId, page }],
    queryFn: () =>
      listMachines({
        search: debouncedSearch || undefined,
        status: status || undefined,
        categoryId: categoryId || undefined,
        page,
        pageSize: 15,
      }),
  });

  const stats = useMemo(() => {
    const items = machinesQuery.data?.items ?? [];
    return {
      available: items.filter((machine) => machine.status === 'AVAILABLE').length,
      inUse: items.filter((machine) => machine.status === 'IN_USE').length,
      maintenance: items.filter((machine) => machine.status === 'MAINTENANCE').length,
    };
  }, [machinesQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['machines'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['live'] });
  };

  const createMutation = useMutation({
    mutationFn: createMachine,
    onSuccess: (machine) => {
      toast.success(`${machine.name} registered with a unique QR code`);
      setFormOpen(false);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: MachineFormValues }) =>
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
    onSuccess: (machine) => {
      toast.success(`${machine.name} updated`);
      setFormOpen(false);
      setEditing(null);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['machine', machine.id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Exclude<MachineStatus, 'IN_USE'> }) =>
      setMachineStatus(id, next),
    onSuccess: (machine) => {
      toast.success(`${machine.name} is now ${machine.status.replace('_', ' ').toLowerCase()}`);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['machine', machine.id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMachine(id),
    onSuccess: () => {
      toast.success('Machine removed');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const machines = machinesQuery.data?.items ?? [];
  const meta = machinesQuery.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gaming Equipment"
        subtitle="Register machines, print QR codes and control availability"
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Register machine
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Available"
          value={stats.available}
          hint="On this page"
          icon={<Gamepad2 className="h-5 w-5" />}
          tone="green"
        />
        <StatCard label="In use" value={stats.inUse} hint="On this page" tone="blue" />
        <StatCard
          label="Maintenance"
          value={stats.maintenance}
          hint="On this page"
          icon={<Wrench className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, code, location..."
              className="sm:max-w-xs"
            />
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as MachineStatus | '')}
              className="sm:max-w-44"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="IN_USE">In use</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
            <Select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="sm:max-w-52"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {(categoriesQuery.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-navy-500">{meta ? `${meta.total} machines` : '—'}</p>
        </div>

        {machinesQuery.isLoading ? (
          <TableSkeleton columns={6} />
        ) : machinesQuery.isError ? (
          <ErrorState message={errorMessage(machinesQuery.error)} onRetry={() => void machinesQuery.refetch()} />
        ) : machines.length === 0 ? (
          <EmptyState
            icon={<Gamepad2 className="h-6 w-6" />}
            title="No machines found"
            description={
              search || status || categoryId
                ? 'Try clearing the filters to see more equipment.'
                : 'Register your first gaming machine to generate its QR code.'
            }
            action={
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Register machine
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Machine</th>
                  <th className="th">Category</th>
                  <th className="th">Status</th>
                  <th className="th">Current session</th>
                  <th className="th">Sessions</th>
                  <th className="th">Revenue</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {machines.map((machine) => (
                  <tr key={machine.id} className="group hover:bg-navy-50/50">
                    <td className="td">
                      <Link to={`/machines/${machine.id}`} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-600">
                          <Gamepad2 className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-navy-900 group-hover:text-brand-700">
                            {machine.name}
                          </span>
                          <span className="block text-xs text-navy-500">
                            {machine.code}
                            {machine.location ? ` • ${machine.location}` : ''}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="td">{machine.category?.name ?? '—'}</td>
                    <td className="td">
                      <MachineStatusBadge status={machine.status} />
                    </td>
                    <td className="td text-xs">
                      {machine.activeSession ? (
                        <span>
                          <span className="font-medium text-navy-900">
                            {machine.activeSession.employer.fullName}
                          </span>
                          <span className="block text-navy-500">{machine.activeSession.packageName}</span>
                        </span>
                      ) : (
                        <span className="text-navy-400">—</span>
                      )}
                    </td>
                    <td className="td">{formatNumber(machine.sessionsCount)}</td>
                    <td className="td font-medium">{formatEtb(machine.revenueSantim ?? 0)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-icon"
                          title="QR code"
                          aria-label={`QR code for ${machine.name}`}
                          onClick={() => setQrMachine(machine)}
                        >
                          <QrCode className="h-4 w-4" />
                        </button>
                        <Link
                          to={`/machines/${machine.id}`}
                          className="btn-icon"
                          title="View machine"
                          aria-label={`View ${machine.name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Edit machine"
                          aria-label={`Edit ${machine.name}`}
                          onClick={() => {
                            setEditing(machine);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <details className="relative">
                          <summary
                            className="btn-icon cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                            title="More actions"
                            aria-label={`More actions for ${machine.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </summary>
                          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-navy-200 bg-white py-1 shadow-xl">
                            {machine.status !== 'AVAILABLE' ? (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-navy-700 hover:bg-navy-50"
                                onClick={() =>
                                  statusMutation.mutate({ id: machine.id, next: 'AVAILABLE' })
                                }
                              >
                                <Gamepad2 className="h-3.5 w-3.5" /> Mark available
                              </button>
                            ) : null}
                            {machine.status !== 'MAINTENANCE' ? (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-navy-700 hover:bg-navy-50"
                                onClick={() =>
                                  statusMutation.mutate({ id: machine.id, next: 'MAINTENANCE' })
                                }
                              >
                                <Wrench className="h-3.5 w-3.5" /> Put in maintenance
                              </button>
                            ) : null}
                            {machine.status !== 'INACTIVE' ? (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-navy-700 hover:bg-navy-50"
                                onClick={() =>
                                  statusMutation.mutate({ id: machine.id, next: 'INACTIVE' })
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Deactivate
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 border-t border-navy-100 px-3 py-2 text-left text-xs text-danger-600 hover:bg-danger-50"
                              onClick={() => setDeleteTarget(machine)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove machine
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

      <MachineFormModal
        open={formOpen}
        machine={editing}
        categories={categoriesQuery.data ?? []}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={async (values) => {
          if (editing) {
            await updateMutation.mutateAsync({ id: editing.id, values });
          } else {
            await createMutation.mutateAsync(values);
          }
        }}
      />

      <QRCodeModal machine={qrMachine} open={!!qrMachine} onClose={() => setQrMachine(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove this machine?"
        description={`${deleteTarget?.name ?? 'This machine'} will be deactivated and its QR code revoked. Historical sessions and payments are preserved. This cannot be undone.`}
        confirmLabel="Remove machine"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <div className="flex items-center gap-2 rounded-lg bg-navy-100/60 px-4 py-3 text-xs text-navy-600">
        <Search className="h-3.5 w-3.5" />
        Every machine receives a unique, non-guessable QR code. Regenerating a code invalidates the old
        printed copy immediately.
      </div>
    </div>
  );
}
