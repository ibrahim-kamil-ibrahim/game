import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Package, Pencil, Plus, Trash2, Power, Layers } from 'lucide-react';
import { toast } from 'sonner';
import {
  createPackage,
  deletePackage,
  listPackages,
  updatePackage,
} from '../services/packages';
import { listCategories } from '../services/categories';
import { listMachines } from '../services/machines';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader, SectionCard, SearchInput, StatCard } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PackageFormModal, type PackageSubmitValues } from '../components/PackageFormModal';
import { errorMessage, formatEtb, formatNumber, humanize } from '../lib/utils';
import type { GamePackage, PackageScope, PackageStatus } from '../types';

export function PackagesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [status, setStatus] = useState<PackageStatus | ''>('');
  const [scope, setScope] = useState<PackageScope | ''>('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GamePackage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GamePackage | null>(null);

  useEffect(() => setPage(1), [debouncedSearch, status, scope]);

  const packagesQuery = useQuery({
    queryKey: ['packages', { search: debouncedSearch, status, scope, page }],
    queryFn: () =>
      listPackages({
        search: debouncedSearch || undefined,
        status: status || undefined,
        scope: scope || undefined,
        page,
        pageSize: 15,
      }),
  });

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const machinesQuery = useQuery({
    queryKey: ['machines', 'all'],
    queryFn: () => listMachines({ pageSize: 100 }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['packages'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['machine'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: PackageSubmitValues) => createPackage(values),
    onSuccess: (pkg) => {
      toast.success(`${pkg.name} package created`);
      setFormOpen(false);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: PackageSubmitValues }) =>
      updatePackage(id, values),
    onSuccess: (pkg) => {
      toast.success(`${pkg.name} updated`);
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (pkg: GamePackage) =>
      updatePackage(pkg.id, { status: pkg.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: (pkg) => {
      toast.success(`${pkg.name} is now ${pkg.status.toLowerCase()}`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePackage(id),
    onSuccess: () => {
      toast.success('Package removed');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = packagesQuery.data?.items ?? [];
  const meta = packagesQuery.data?.meta;
  const activeCount = items.filter((pkg) => pkg.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Game Packages"
        subtitle="Admin-controlled prices and durations — employers can never change them"
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New package
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Packages on this page"
          value={formatNumber(items.length)}
          icon={<Package className="h-5 w-5" />}
          tone="navy"
        />
        <StatCard label="Active" value={activeCount} icon={<Power className="h-5 w-5" />} tone="green" />
        <StatCard
          label="Revenue (all time)"
          value={formatEtb(items.reduce((sum, pkg) => sum + pkg.revenueSantim, 0))}
          icon={<Layers className="h-5 w-5" />}
          tone="blue"
        />
      </div>

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search packages..."
              className="sm:max-w-xs"
            />
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as PackageStatus | '')}
              className="sm:max-w-44"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
            <Select
              value={scope}
              onChange={(event) => setScope(event.target.value as PackageScope | '')}
              className="sm:max-w-52"
              aria-label="Filter by scope"
            >
              <option value="">All scopes</option>
              <option value="ALL">All machines</option>
              <option value="CATEGORY">Category</option>
              <option value="MACHINES">Specific machines</option>
            </Select>
          </div>
          <p className="text-xs text-navy-500">{meta ? `${meta.total} packages` : '—'}</p>
        </div>

        {packagesQuery.isLoading ? (
          <TableSkeleton columns={6} />
        ) : packagesQuery.isError ? (
          <ErrorState message={errorMessage(packagesQuery.error)} onRetry={() => void packagesQuery.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="No packages configured"
            description="Create pricing packages so employers can rent machines."
            action={
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Create package
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Package</th>
                  <th className="th">Duration</th>
                  <th className="th">Price</th>
                  <th className="th">Applies to</th>
                  <th className="th">Status</th>
                  <th className="th">Usage</th>
                  <th className="th">Revenue</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {items.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-navy-50/50">
                    <td className="td">
                      <p className="font-semibold text-navy-900">{pkg.name}</p>
                      {pkg.description ? (
                        <p className="max-w-56 truncate text-xs text-navy-500">{pkg.description}</p>
                      ) : null}
                    </td>
                    <td className="td whitespace-nowrap">{pkg.durationMinutes} min</td>
                    <td className="td font-semibold whitespace-nowrap">{formatEtb(pkg.priceSantim)}</td>
                    <td className="td text-xs">
                      {pkg.scope === 'ALL' ? (
                        <Badge tone="neutral">All machines</Badge>
                      ) : pkg.scope === 'CATEGORY' ? (
                        <Badge tone="blue">{pkg.category?.name ?? 'Category'}</Badge>
                      ) : (
                        <span title={pkg.machines.map((machine) => machine.name).join(', ')}>
                          <Badge tone="purple">{pkg.machines.length} machines</Badge>
                        </span>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={pkg.status === 'ACTIVE' ? 'green' : 'neutral'} dot>
                        {humanize(pkg.status)}
                      </Badge>
                    </td>
                    <td className="td">{formatNumber(pkg.sessionsCount)} sessions</td>
                    <td className="td font-semibold">{formatEtb(pkg.revenueSantim)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-icon"
                          title={pkg.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          aria-label={pkg.status === 'ACTIVE' ? 'Deactivate package' : 'Activate package'}
                          onClick={() => toggleMutation.mutate(pkg)}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Edit package"
                          aria-label={`Edit ${pkg.name}`}
                          onClick={() => {
                            setEditing(pkg);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <details className="relative">
                          <summary className="btn-icon cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <MoreVertical className="h-4 w-4" />
                          </summary>
                          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-navy-200 bg-white py-1 shadow-xl">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger-600 hover:bg-danger-50"
                              onClick={() => setDeleteTarget(pkg)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete package
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

      <PackageFormModal
        open={formOpen}
        pkg={editing}
        categories={categoriesQuery.data ?? []}
        machines={machinesQuery.data?.items ?? []}
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this package?"
        description={`${deleteTarget?.name ?? 'This package'} will be removed from the catalog. Packages that have already been used in transactions cannot be deleted — deactivate them instead.`}
        confirmLabel="Delete package"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
