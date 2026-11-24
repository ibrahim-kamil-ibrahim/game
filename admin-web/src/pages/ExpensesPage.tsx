import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from '../services/expenses';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader, SectionCard, SearchInput, StatCard } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { SimpleBars } from '../components/charts/RevenueChart';
import { errorMessage, formatDate, formatEtb, humanize, todayIso } from '../lib/utils';
import type { Expense, ExpenseCategory } from '../types';

const categories: ExpenseCategory[] = [
  'ELECTRICITY',
  'MAINTENANCE',
  'RENT',
  'INTERNET',
  'EMPLOYEE_COSTS',
  'OTHER',
];

const schema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(120),
  category: z.enum(['ELECTRICITY', 'MAINTENANCE', 'RENT', 'INTERNET', 'EMPLOYEE_COSTS', 'OTHER']),
  amountEtb: z.coerce.number().positive('Amount must be greater than zero').max(10_000_000),
  expenseDate: z.string().min(1, 'Choose a date'),
  description: z.string().trim().max(1000).optional(),
  receiptUrl: z.string().trim().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function ExpensesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => setPage(1), [debouncedSearch, category, from, to]);

  const query = useQuery({
    queryKey: ['expenses', { search: debouncedSearch, category, from, to, page }],
    queryFn: () =>
      listExpenses({
        search: debouncedSearch || undefined,
        category: category || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        page,
        pageSize: 15,
      }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) as unknown as Resolver<FormValues> });

  useEffect(() => {
    if (!formOpen) return;
    setServerError(null);
    reset({
      title: editing?.title ?? '',
      category: editing?.category ?? 'OTHER',
      amountEtb: editing ? editing.amountSantim / 100 : 0,
      expenseDate: editing ? editing.expenseDate.slice(0, 10) : todayIso(),
      description: editing?.description ?? '',
      receiptUrl: editing?.receiptUrl ?? '',
    });
  }, [formOpen, editing, reset]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        title: values.title,
        category: values.category,
        amountSantim: Math.round(values.amountEtb * 100),
        expenseDate: new Date(`${values.expenseDate}T12:00:00`).toISOString(),
        description: values.description || undefined,
        receiptUrl: values.receiptUrl || undefined,
      };
      return editing ? updateExpense(editing.id, payload) : createExpense(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Expense updated' : 'Expense recorded');
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      toast.success('Expense removed');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

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
        title="Expenses"
        subtitle="Record business costs so profit reporting stays accurate"
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Record expense
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Expenses (filtered)"
          value={formatEtb(query.data?.summary.totalSantim ?? 0)}
          icon={<ReceiptText className="h-5 w-5" />}
          tone="red"
        />
        {categories.slice(0, 3).map((item) => {
          const entry = query.data?.summary.byCategory.find((row) => row.category === item);
          return (
            <StatCard
              key={item}
              label={humanize(item)}
              value={formatEtb(entry?.amountSantim ?? 0)}
              hint={`${entry?.count ?? 0} entries`}
              tone="navy"
            />
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-4">
        <SectionCard className="xl:col-span-3" padded={false}>
          <div className="flex flex-col gap-3 border-b border-navy-100 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search expenses..."
                className="sm:max-w-xs"
              />
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value as ExpenseCategory | '')}
                className="sm:max-w-48"
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {humanize(item)}
                  </option>
                ))}
              </Select>
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="sm:max-w-40" aria-label="From date" />
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="sm:max-w-40" aria-label="To date" />
            </div>
            <p className="text-xs text-navy-500">{meta ? `${meta.total} entries` : '—'}</p>
          </div>

          {query.isLoading ? (
            <TableSkeleton columns={5} />
          ) : query.isError ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<ReceiptText className="h-6 w-6" />}
              title="No expenses recorded"
              description="Record rent, electricity, maintenance and other costs to calculate real profit."
              action={
                <Button variant="primary" onClick={() => setFormOpen(true)}>
                  Record expense
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-navy-50/80">
                  <tr>
                    <th className="th">Expense</th>
                    <th className="th">Category</th>
                    <th className="th">Date</th>
                    <th className="th">Amount</th>
                    <th className="th">Recorded by</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {items.map((expense) => (
                    <tr key={expense.id} className="hover:bg-navy-50/50">
                      <td className="td">
                        <p className="font-semibold text-navy-900">{expense.title}</p>
                        {expense.description ? (
                          <p className="max-w-64 truncate text-xs text-navy-500">{expense.description}</p>
                        ) : null}
                      </td>
                      <td className="td">{humanize(expense.category)}</td>
                      <td className="td whitespace-nowrap text-xs">{formatDate(expense.expenseDate)}</td>
                      <td className="td font-semibold">{formatEtb(expense.amountSantim)}</td>
                      <td className="td text-xs">{expense.recordedBy.fullName}</td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="btn-icon"
                            title="Edit expense"
                            onClick={() => {
                              setEditing(expense);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="btn-icon text-danger-500 hover:bg-danger-50"
                            title="Delete expense"
                            onClick={() => setDeleteTarget(expense)}
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

          {meta ? <Pagination meta={meta} onPageChange={setPage} /> : null}
        </SectionCard>

        <SectionCard title="By category" description="Filtered period">
          {query.data?.summary.byCategory.length ? (
            <SimpleBars
              data={query.data.summary.byCategory.map((row) => ({
                label: humanize(row.category),
                value: row.amountSantim,
                caption: formatEtb(row.amountSantim),
              }))}
            />
          ) : (
            <p className="py-6 text-center text-xs text-navy-400">No expense data</p>
          )}
        </SectionCard>
      </div>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit expense' : 'Record business expense'}
        description="Expenses reduce net profit. Revenue is never mixed with costs."
        size="md"
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
              {editing ? 'Save changes' : 'Record expense'}
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={submitForm} noValidate>
          {serverError ? (
            <div className="rounded-lg border border-danger-500/25 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
              {serverError}
            </div>
          ) : null}
          <Field label="Title" error={errors.title?.message} required>
            <Input placeholder="Electricity bill - November" invalid={!!errors.title} {...register('title')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" error={errors.category?.message} required>
              <Select {...register('category')}>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {humanize(item)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (ETB)" error={errors.amountEtb?.message} required>
              <Input type="number" min={0.01} step="0.01" invalid={!!errors.amountEtb} {...register('amountEtb')} />
            </Field>
            <Field label="Expense date" error={errors.expenseDate?.message} required>
              <Input type="date" invalid={!!errors.expenseDate} {...register('expenseDate')} />
            </Field>
            <Field label="Receipt URL" error={errors.receiptUrl?.message} hint="Optional link to a stored receipt">
              <Input placeholder="https://..." {...register('receiptUrl')} />
            </Field>
          </div>
          <Field label="Description" error={errors.description?.message}>
            <Textarea placeholder="Optional notes" {...register('description')} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this expense?"
        description={`${deleteTarget?.title ?? 'This expense'} will be removed from expense reporting. The audit log keeps a record of the deletion.`}
        confirmLabel="Delete expense"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
