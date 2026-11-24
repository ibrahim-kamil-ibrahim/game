import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check } from 'lucide-react';
import type { Category, GamePackage, Machine } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Input';
import { errorMessage } from '../lib/utils';

const schema = z.object({
  name: z.string().trim().min(2, 'Package name is required').max(80),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.coerce
    .number()
    .int('Duration must be a whole number')
    .min(1, 'At least 1 minute')
    .max(1440, 'Maximum 1440 minutes'),
  priceEtb: z.coerce
    .number()
    .positive('Price must be greater than zero')
    .max(1_000_000, 'Price is too large'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  scope: z.enum(['ALL', 'CATEGORY', 'MACHINES']),
  categoryId: z.string().optional(),
  displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
});

type FormValues = z.infer<typeof schema>;

export interface PackageSubmitValues {
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceSantim: number;
  status: 'ACTIVE' | 'INACTIVE';
  scope: 'ALL' | 'CATEGORY' | 'MACHINES';
  categoryId?: string | null;
  machineIds?: string[];
  displayOrder?: number;
}

export function PackageFormModal({
  open,
  pkg,
  categories,
  machines,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pkg?: GamePackage | null;
  categories: Category[];
  machines: Machine[];
  onClose: () => void;
  onSubmit: (values: PackageSubmitValues) => Promise<unknown>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [machineIds, setMachineIds] = useState<string[]>([]);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: { status: 'ACTIVE', scope: 'ALL', displayOrder: 0 },
  });

  const scope = watch('scope');

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    setScopeError(null);
    setMachineIds(pkg?.machines.map((machine) => machine.id) ?? []);
    reset({
      name: pkg?.name ?? '',
      description: pkg?.description ?? '',
      durationMinutes: pkg?.durationMinutes ?? 30,
      priceEtb: pkg ? pkg.priceSantim / 100 : 50,
      status: pkg?.status ?? 'ACTIVE',
      scope: pkg?.scope ?? 'ALL',
      categoryId: pkg?.category?.id ?? '',
      displayOrder: pkg?.displayOrder ?? 0,
    });
  }, [open, pkg, reset]);

  const submit = async (values: FormValues) => {
    setServerError(null);
    setScopeError(null);
    if (values.scope === 'CATEGORY' && !values.categoryId) {
      setScopeError('Select the category this package applies to');
      return;
    }
    if (values.scope === 'MACHINES' && machineIds.length === 0) {
      setScopeError('Select at least one machine');
      return;
    }
    try {
      await onSubmit({
        name: values.name,
        description: values.description || null,
        durationMinutes: values.durationMinutes,
        priceSantim: Math.round(values.priceEtb * 100),
        status: values.status,
        scope: values.scope,
        categoryId: values.scope === 'CATEGORY' ? values.categoryId || null : null,
        machineIds: values.scope === 'MACHINES' ? machineIds : [],
        displayOrder: values.displayOrder ?? 0,
      });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pkg ? 'Edit game package' : 'Create game package'}
      description="Prices and durations are controlled here. Employers can only choose from active packages."
      size="lg"
      disableClose={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            {pkg ? 'Save changes' : 'Create package'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(submit)} noValidate>
        {serverError ? (
          <div className="rounded-lg border border-danger-500/25 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
            {serverError}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Package name" htmlFor="pkg-name" error={errors.name?.message} required>
            <Input id="pkg-name" placeholder="Premium" invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field
            label="Display order"
            htmlFor="displayOrder"
            error={errors.displayOrder?.message}
            hint="Lower numbers appear first"
          >
            <Input id="displayOrder" type="number" min={0} {...register('displayOrder')} />
          </Field>
          <Field
            label="Duration (minutes)"
            htmlFor="durationMinutes"
            error={errors.durationMinutes?.message}
            required
          >
            <Input
              id="durationMinutes"
              type="number"
              min={1}
              max={1440}
              invalid={!!errors.durationMinutes}
              {...register('durationMinutes')}
            />
          </Field>
          <Field
            label="Price (ETB)"
            htmlFor="priceEtb"
            error={errors.priceEtb?.message}
            hint="Charged in cash by the employer"
            required
          >
            <Input
              id="priceEtb"
              type="number"
              min={0.01}
              step="0.01"
              invalid={!!errors.priceEtb}
              {...register('priceEtb')}
            />
          </Field>
          <Field label="Status" htmlFor="pkg-status" error={errors.status?.message}>
            <Select id="pkg-status" {...register('status')}>
              <option value="ACTIVE">Active (available to employers)</option>
              <option value="INACTIVE">Inactive (hidden)</option>
            </Select>
          </Field>
          <Field label="Applies to" htmlFor="scope" error={errors.scope?.message}>
            <Select id="scope" {...register('scope')}>
              <option value="ALL">All machines</option>
              <option value="CATEGORY">A category of machines</option>
              <option value="MACHINES">Specific machines</option>
            </Select>
          </Field>
        </div>

        {scope === 'CATEGORY' ? (
          <Field label="Category" htmlFor="pkg-category" error={scopeError ?? errors.categoryId?.message} required>
            <Select id="pkg-category" invalid={!!scopeError} {...register('categoryId')}>
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {scope === 'MACHINES' ? (
          <div>
            <p className="label">
              Machines <span className="text-danger-500">*</span>
            </p>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-navy-200 p-2">
              {machines.length === 0 ? (
                <p className="px-2 py-3 text-xs text-navy-500">No machines registered yet.</p>
              ) : (
                machines.map((machine) => {
                  const checked = machineIds.includes(machine.id);
                  return (
                    <button
                      key={machine.id}
                      type="button"
                      onClick={() =>
                        setMachineIds((current) =>
                          checked ? current.filter((id) => id !== machine.id) : [...current, machine.id],
                        )
                      }
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        checked ? 'bg-brand-50 text-brand-700' : 'text-navy-700 hover:bg-navy-50'
                      }`}
                    >
                      <span>
                        <span className="font-medium">{machine.name}</span>
                        <span className="ml-1 text-xs text-navy-400">{machine.code}</span>
                      </span>
                      {checked ? <Check className="h-4 w-4" /> : null}
                    </button>
                  );
                })
              )}
            </div>
            {scopeError ? <p className="mt-1.5 text-xs font-medium text-danger-600">{scopeError}</p> : null}
          </div>
        ) : null}

        <Field label="Description" htmlFor="pkg-description" error={errors.description?.message}>
          <Textarea id="pkg-description" placeholder="Optional notes shown to employers" {...register('description')} />
        </Field>

        <p className="rounded-lg bg-warning-50 px-3.5 py-2.5 text-xs leading-5 text-warning-600">
          Changing a price or duration only affects future sales. Sessions already started keep the price
          and duration recorded when they were created.
        </p>
      </form>
    </Modal>
  );
}
