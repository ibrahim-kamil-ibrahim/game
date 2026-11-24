import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { changePassword, logout } from '../services/auth';
import { useAuthStore } from '../stores/auth';
import { PageHeader, SectionCard, Avatar, DetailRow } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { errorMessage, formatDateTime, humanize } from '../lib/utils';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Must include a letter')
      .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const submit = async (values: FormValues) => {
    setServerError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success('Password changed. Please sign in again.');
      clear();
      navigate('/login', { replace: true });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Account details and password security" />

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard>
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName} size="lg" />
            <div>
              <p className="text-base font-bold text-navy-900">{user.fullName}</p>
              <p className="text-sm text-navy-500">@{user.username}</p>
              <div className="mt-1.5 flex gap-2">
                <Badge tone="navy">{humanize(user.role)}</Badge>
                <Badge tone={user.status === 'ACTIVE' ? 'green' : 'red'}>{humanize(user.status)}</Badge>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <DetailRow label="Business" value={user.business.name} />
            <DetailRow label="Timezone" value={user.business.timezone} />
            <DetailRow label="Currency" value={user.business.currency} />
            <DetailRow label="Phone" value={user.phone ?? '—'} />
            <DetailRow label="Last login" value={formatDateTime(user.lastLoginAt)} />
            <DetailRow label="Account created" value={formatDateTime(user.createdAt)} />
          </div>
          <Button
            variant="secondary"
            className="mt-4 w-full"
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </Button>
        </SectionCard>

        <SectionCard className="xl:col-span-2" title="Change password" description="You will be signed out of all devices after changing your password.">
          <form className="max-w-md space-y-4" onSubmit={handleSubmit(submit)} noValidate>
            {serverError ? (
              <div className="rounded-lg border border-danger-500/25 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
                {serverError}
              </div>
            ) : null}
            <Field label="Current password" error={errors.currentPassword?.message} required>
              <Input
                type="password"
                autoComplete="current-password"
                invalid={!!errors.currentPassword}
                {...register('currentPassword')}
              />
            </Field>
            <Field
              label="New password"
              error={errors.newPassword?.message}
              hint="At least 8 characters with a letter and a number"
              required
            >
              <Input
                type="password"
                autoComplete="new-password"
                invalid={!!errors.newPassword}
                {...register('newPassword')}
              />
            </Field>
            <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
              <Input
                type="password"
                autoComplete="new-password"
                invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" loading={isSubmitting}>
                Update password
              </Button>
              <Button type="button" variant="ghost" onClick={() => reset()} disabled={isSubmitting}>
                Clear
              </Button>
            </div>
          </form>

          <div className="mt-8 flex items-start gap-2 rounded-lg bg-navy-50 px-4 py-3 text-xs leading-5 text-navy-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
            Passwords are hashed with bcrypt and never stored in plain text. Access tokens are short-lived and
            refresh tokens rotate on every use.
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
