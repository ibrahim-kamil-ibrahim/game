import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { EmployerListItem } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input } from './ui/Input';
import { copyText, errorMessage, generateEmployerPassword, generateEmployerUsername } from '../lib/utils';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  username: z
    .string()
    .trim()
    .min(3, 'At least 3 characters')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dot, dash and underscore'),
  phone: z.string().trim().max(32).optional(),
  password: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function EmployerFormModal({
  open,
  employer,
  onClose,
  onSubmit,
}: {
  open: boolean;
  employer?: EmployerListItem | null;
  onClose: () => void;
  onSubmit: (values: { fullName: string; username: string; phone?: string; password?: string }) => Promise<unknown>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const isEdit = !!employer;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const username = watch('username');
  const password = watch('password');

  const populate = (fullName: string, nextUsername?: string) => {
    setValue('username', nextUsername ?? generateEmployerUsername(fullName), {
      shouldValidate: true,
    });
    setValue('password', generateEmployerPassword(), { shouldValidate: true });
  };

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    setShowPassword(false);
    if (employer) {
      reset({
        fullName: employer.fullName,
        username: employer.username,
        phone: employer.phone ?? '',
        password: '',
      });
    } else {
      const generatedUsername = generateEmployerUsername('');
      reset({
        fullName: '',
        username: generatedUsername,
        phone: '',
        password: generateEmployerPassword(),
      });
    }
  }, [open, employer, reset]);

  const regenerate = () => {
    populate(getValues('fullName') || '', undefined);
  };

  const copy = async (value: string, label: string) => {
    if (!value) return;
    const ok = await copyText(value);
    if (ok) toast.success(`${label} copied`);
    else toast.error('Could not copy to the clipboard');
  };

  const copyBoth = async () => {
    const text = [
      'GameZone Employer sign-in',
      `Username: ${username}`,
      `Temporary password: ${password}`,
      '',
      'Sign in with the GameZone Employer app and change the password after signing in.',
    ].join('\n');
    const ok = await copyText(text);
    if (ok) toast.success('Credentials copied');
    else toast.error('Could not copy to the clipboard');
  };

  const submit = async (values: FormValues) => {
    setServerError(null);
    if (!isEdit) {
      if (!values.password || values.password.length < 8 || !/[A-Za-z]/.test(values.password) || !/[0-9]/.test(values.password)) {
        setServerError('Password must be at least 8 characters and include a letter and a number.');
        return;
      }
    }
    try {
      await onSubmit({
        fullName: values.fullName,
        username: values.username,
        phone: values.phone || undefined,
        ...(values.password ? { password: values.password } : {}),
      });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit employer' : 'Create employer account'}
      description={
        isEdit
          ? 'Update the employer profile or username.'
          : 'Employers use the mobile app to scan QR codes and register cash payments.'
      }
      size="md"
      disableClose={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            {isEdit ? 'Save changes' : 'Create employer'}
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

        {!isEdit ? (
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-brand-700">Credentials generated automatically</p>
                <p className="mt-0.5 text-[11px] leading-4 text-brand-600">
                  Share them securely. You can copy them again from the employer detail page until the
                  employer signs in for the first time.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={copyBoth}
                >
                  Copy both
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={regenerate}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <Field label="Full name" error={errors.fullName?.message} required>
          <Input placeholder="Abebe Bekele" invalid={!!errors.fullName} {...register('fullName')} />
        </Field>
        <Field label="Username" error={errors.username?.message} required hint="Used to sign in on the mobile app">
          <div className="relative">
            <Input
              placeholder="abebe"
              className="pr-10 font-mono"
              invalid={!!errors.username}
              {...register('username')}
            />
            <button
              type="button"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
              onClick={() => copy(username ?? '', 'Username')}
              aria-label="Copy username"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </Field>
        <Field label="Phone number" error={errors.phone?.message}>
          <Input placeholder="+251 9xx xxx xxx" {...register('phone')} />
        </Field>

        {!isEdit ? (
          <Field
            label="Initial password"
            error={errors.password?.message}
            hint="Generated automatically. At least 8 characters with a letter, a number and a symbol."
            required
          >
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Temporary password"
                className="pr-20 font-mono"
                autoComplete="new-password"
                {...register('password')}
              />
              <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
                <button
                  type="button"
                  className="rounded-md p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
                  onClick={() => copy(password ?? '', 'Password')}
                  aria-label="Copy password"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </Field>
        ) : null}
      </form>
    </Modal>
  );
}
