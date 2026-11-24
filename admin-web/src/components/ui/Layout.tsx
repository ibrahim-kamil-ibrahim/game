import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn, initials } from '../../lib/utils';

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-5 py-4">
          <div>
            {title ? <h2 className="text-sm font-semibold text-navy-900">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-navy-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? 'p-5' : undefined}>{children}</div>
    </section>
  );
}

const toneMap = {
  blue: 'bg-brand-50 text-brand-600',
  green: 'bg-success-50 text-success-600',
  amber: 'bg-warning-50 text-warning-600',
  red: 'bg-danger-50 text-danger-600',
  navy: 'bg-navy-100 text-navy-700',
  purple: 'bg-violet-50 text-violet-600',
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
  loading = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof toneMap;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('card p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-navy-500 uppercase">{label}</p>
          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-navy-100" />
          ) : (
            <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-navy-900">{value}</p>
          )}
          {hint ? <div className="mt-1 text-xs text-navy-500">{hint}</div> : null}
        </div>
        {icon ? (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneMap[tone])}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const avatarColors = [
  'bg-brand-100 text-brand-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const index = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarColors.length;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        avatarColors[index],
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-14 w-14 text-lg',
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-navy-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input py-2 pl-9"
        aria-label={placeholder}
      />
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white p-1 shadow-xs ring-1 ring-navy-200/70">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn('tab', active === tab.id && 'tab-active')}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                active === tab.id ? 'bg-white/20' : 'bg-navy-100 text-navy-600',
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-navy-100 py-2.5 last:border-0">
      <span className="text-xs font-medium text-navy-500">{label}</span>
      <span className="text-right text-sm font-medium text-navy-900">{value}</span>
    </div>
  );
}
