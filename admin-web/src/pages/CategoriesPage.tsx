import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Power, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../services/categories';
import { PageHeader, SectionCard, StatCard } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { errorMessage } from '../lib/utils';
import type { Category } from '../types';

const schema = z.object({
  name: z.string().trim().min(2, 'Category name is required').max(80),
  description: z.string().trim().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['categories'], queryFn: listCategories });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!formOpen) return;
    setServerError(null);
    reset({ name: editing?.name ?? '', description: editing?.description ?? '' });
  }, [formOpen, editing, reset]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['packages'] });
    void queryClient.invalidateQueries({ queryKey: ['machines'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) =>
      editing
        ? updateCategory(editing.id, { name: values.name, description: values.description || null })
        : createCategory({ name: values.name, description: values.description || undefined }),
    onSuccess: (category) => {
      toast.success(editing ? `${category.name} updated` : `${category.name} created`);
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (category: Category) => updateCategory(category.id, { isActive: !category.isActive }),
    onSuccess: (category) => {
      toast.success(`${category.name} is now ${category.isActive ? 'active' : 'inactive'}`);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      toast.success('Category deleted');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const categories = query.data ?? [];

  const submitForm = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await saveMutation.mutateAsync(values);
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipment Categories"
        subtitle="Group machines for targeted package pricing"
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New category
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Categories" value={categories.length} icon={<Tags className="h-5 w-5" />} tone="navy" />
        <StatCard
          label="Active"
          value={categories.filter((category) => category.isActive).length}
          icon={<Power className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Machines assigned"
          value={categories.reduce((sum, category) => sum + category.machineCount, 0)}
          tone="blue"
        />
      </div>

      <SectionCard padded={false}>
        {query.isLoading ? (
          <TableSkeleton columns={5} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={<Tags className="h-6 w-6" />}
            title="No categories yet"
            description="Create categories such as Console, Racing Simulator or VR to group your machines."
            action={
              <Button variant="primary" onClick={() => setFormOpen(true)}>
                Create category
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-navy-50/80">
                <tr>
                  <th className="th">Category</th>
                  <th className="th">Description</th>
                  <th className="th">Machines</th>
                  <th className="th">Packages</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {categories.map((category) => (
                  <tr key={category.id} className="hover:bg-navy-50/50">
                    <td className="td font-semibold text-navy-900">{category.name}</td>
                    <td className="td max-w-72 truncate text-xs">{category.description ?? '—'}</td>
                    <td className="td">{category.machineCount}</td>
                    <td className="td">{category.packageCount}</td>
                    <td className="td">
                      <Badge tone={category.isActive ? 'green' : 'neutral'} dot>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-icon"
                          title={category.isActive ? 'Deactivate' : 'Activate'}
                          onClick={() => toggleMutation.mutate(category)}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Edit category"
                          onClick={() => {
                            setEditing(category);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon text-danger-500 hover:bg-danger-50 hover:text-danger-600"
                          title="Delete category"
                          onClick={() => setDeleteTarget(category)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit category' : 'New equipment category'}
        description="Categories can be used to scope packages to a group of machines."
        size="sm"
        disableClose={isSubmitting}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isSubmitting}
              onClick={submitForm}
            >
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={submitForm}>
          {serverError ? (
            <div className="rounded-lg border border-danger-500/25 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
              {serverError}
            </div>
          ) : null}
          <Field label="Category name" error={errors.name?.message} required>
            <Input placeholder="Console Gaming" invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field label="Description" error={errors.description?.message}>
            <Textarea placeholder="PlayStation and Xbox stations" {...register('description')} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete category?"
        description={`${deleteTarget?.name ?? 'This category'} can only be deleted when no machines or packages reference it.`}
        confirmLabel="Delete category"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
