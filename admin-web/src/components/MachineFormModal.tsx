import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Category, Machine } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input, Select, Textarea } from './ui/Input';
import { errorMessage } from '../lib/utils';
import { suggestNextMachineCode } from '../lib/machineCode';

const schema = z.object({
  name: z.string().trim().min(2, 'Machine name is required').max(120),
  code: z
    .string()
    .trim()
    .min(2, 'Machine code is required')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dot, dash or underscore only'),
  categoryId: z.string().optional(),
  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  imageUrl: z.string().trim().max(2000).optional(),
  description: z.string().trim().max(1000).optional(),
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'INACTIVE']).optional(),
});

export type MachineFormValues = z.infer<typeof schema>;

export function MachineFormModal({
  open,
  machine,
  categories,
  existingCodes = [],
  onClose,
  onSubmit,
}: {
  open: boolean;
  machine?: Machine | null;
  categories: Category[];
  existingCodes?: string[];
  onClose: () => void;
  onSubmit: (values: MachineFormValues) => Promise<unknown>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const suggestedCode = useMemo(
    () => suggestNextMachineCode(existingCodes),
    [existingCodes],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MachineFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'AVAILABLE' },
  });

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset({
      name: machine?.name ?? '',
      code: machine?.code ?? suggestedCode,
      categoryId: machine?.category?.id ?? '',
      brand: machine?.brand ?? '',
      model: machine?.model ?? '',
      serialNumber: machine?.serialNumber ?? '',
      location: machine?.location ?? '',
      imageUrl: machine?.imageUrl ?? '',
      description: machine?.description ?? '',
      status: (machine?.status === 'IN_USE' ? 'AVAILABLE' : machine?.status) ?? 'AVAILABLE',
    });
  }, [open, machine, reset, suggestedCode]);

  const submit = async (values: MachineFormValues) => {
    setServerError(null);
    try {
      await onSubmit({
        ...values,
        categoryId: values.categoryId || undefined,
        brand: values.brand || undefined,
        model: values.model || undefined,
        serialNumber: values.serialNumber || undefined,
        location: values.location || undefined,
        imageUrl: values.imageUrl || undefined,
        description: values.description || undefined,
      });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={machine ? 'Edit machine' : 'Register gaming machine'}
      description={
        machine
          ? 'Update equipment details. Pricing is managed separately in game packages.'
          : 'Each machine receives a unique QR code that employers scan to start a rental.'
      }
      size="lg"
      disableClose={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            {machine ? 'Save changes' : 'Register machine'}
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
          <Field label="Machine name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" placeholder="PlayStation 5 - Station 1" invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field
            label="Machine code"
            htmlFor="code"
            error={errors.code?.message}
            hint={machine ? 'Short unique internal code, e.g. PS5-01' : 'Auto-suggested next code; you can change it'}
            required
          >
            <Input
              id="code"
              placeholder="PS5-01"
              className="uppercase"
              invalid={!!errors.code}
              {...register('code')}
            />
          </Field>
          <Field label="Category" htmlFor="categoryId" error={errors.categoryId?.message}>
            <Select id="categoryId" {...register('categoryId')}>
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" htmlFor="location" error={errors.location?.message}>
            <Input id="location" placeholder="Main hall" {...register('location')} />
          </Field>
          <Field label="Brand" htmlFor="brand" error={errors.brand?.message}>
            <Input id="brand" placeholder="Sony" {...register('brand')} />
          </Field>
          <Field label="Model" htmlFor="model" error={errors.model?.message}>
            <Input id="model" placeholder="PlayStation 5" {...register('model')} />
          </Field>
          <Field label="Serial number" htmlFor="serialNumber" error={errors.serialNumber?.message}>
            <Input id="serialNumber" placeholder="Optional" {...register('serialNumber')} />
          </Field>
          <Field label="Initial status" htmlFor="status" error={errors.status?.message}>
            <Select id="status" disabled={!!machine} {...register('status')}>
              <option value="AVAILABLE">Available</option>
              <option value="MAINTENANCE">Under maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
        </div>

        <Field label="Image URL" htmlFor="imageUrl" error={errors.imageUrl?.message} hint="Optional link to a machine photo">
          <Input id="imageUrl" placeholder="https://..." {...register('imageUrl')} />
        </Field>

        <Field label="Description" htmlFor="description" error={errors.description?.message}>
          <Textarea id="description" placeholder="Notes about this machine" {...register('description')} />
        </Field>

        {!machine ? (
          <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-xs leading-5 text-brand-700">
            A unique QR code is generated automatically when the machine is registered. You can download
            and print it from the machine list at any time.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
