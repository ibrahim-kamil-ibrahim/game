import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Gamepad2, Lock, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { login, logout } from '../services/auth';
import { useAuthStore } from '../stores/auth';
import { errorMessage } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';

const schema = z.object({
  username: z.string().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const user = await login(values.username, values.password);
      if (user.role !== 'ADMIN') {
        await logout();
        setServerError('This dashboard is for administrators. Employers must use the mobile application.');
        return;
      }
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}`);
      navigate('/', { replace: true });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  return (
    <div className="flex min-h-screen bg-navy-50">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(37,99,235,0.55), transparent 45%), radial-gradient(circle at 80% 70%, rgba(59,130,246,0.35), transparent 50%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600">
              <Gamepad2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">GameZone</p>
              <p className="text-xs text-navy-300">Rental Management System</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="text-[11px] font-bold tracking-[0.2em] text-brand-300 uppercase">
            Operations Control Center
          </p>
          <h1 className="mt-4 text-4xl leading-tight font-bold tracking-tight">
            Every machine, session and birr in one place.
          </h1>
          <p className="mt-4 text-sm leading-6 text-navy-200">
            Manage gaming equipment, pricing, employers and cash flow with live session monitoring and
            accurate financial reporting.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: ShieldCheck, title: 'Admin-controlled pricing', body: 'Prices and durations are always set here and verified by the server.' },
              { icon: Gamepad2, title: 'Live machine monitoring', body: 'See every occupied machine and its countdown in real time.' },
              { icon: Lock, title: 'Secure by design', body: 'Role-based access, audit trails and signed QR codes for every machine.' },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="h-4.5 w-4.5 text-brand-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-navy-300">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-navy-400">
          © {new Date().getFullYear()} GameZone. Internal administrative access only.
        </p>
      </div>

      <div className="flex w-full items-center justify-center px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-white">
              <Gamepad2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold text-navy-900">GameZone Admin</p>
              <p className="text-xs text-navy-500">Rental Management System</p>
            </div>
          </div>

          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-bold text-navy-900">Administrator sign in</h2>
            <p className="mt-1 text-sm text-navy-500">
              Use the administrator credentials configured for your business.
            </p>

            {serverError ? (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-danger-500/25 bg-danger-50 px-3.5 py-3 text-sm text-danger-600"
              >
                {serverError}
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Field label="Username" htmlFor="username" error={errors.username?.message} required>
                <div className="relative">
                  <User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-navy-400" />
                  <Input
                    id="username"
                    autoComplete="username"
                    autoFocus
                    className="pl-9"
                    placeholder="admin"
                    invalid={!!errors.username}
                    {...register('username')}
                  />
                </div>
              </Field>

              <Field label="Password" htmlFor="password" error={errors.password?.message} required>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-navy-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pr-10 pl-9"
                    placeholder="Enter your password"
                    invalid={!!errors.password}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <Button type="submit" variant="primary" loading={isSubmitting} className="mt-2 w-full">
                Sign in securely
              </Button>
            </form>

            <div className="mt-6 rounded-lg bg-navy-50 px-3.5 py-3 text-xs leading-5 text-navy-500">
              Employers do not use this dashboard. They operate machines through the GameZone Employer
              mobile application.
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-navy-400">
            Protected by role-based access control and audit logging.
          </p>
        </div>
      </div>
    </div>
  );
}
