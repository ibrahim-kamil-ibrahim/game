import type { ReactNode } from 'react';
import { cn, humanize } from '../../lib/utils';
import type { MachineStatus, PaymentStatus, SessionStatus, UserStatus } from '../../types';

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'navy' | 'purple';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-navy-100 text-navy-600',
  blue: 'bg-brand-50 text-brand-700',
  green: 'bg-success-50 text-success-600',
  amber: 'bg-warning-50 text-warning-600',
  red: 'bg-danger-50 text-danger-600',
  navy: 'bg-navy-900 text-white',
  purple: 'bg-violet-50 text-violet-700',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn('badge', tones[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const machineTone: Record<MachineStatus, BadgeTone> = {
  AVAILABLE: 'green',
  IN_USE: 'blue',
  MAINTENANCE: 'amber',
  INACTIVE: 'neutral',
};

export function MachineStatusBadge({ status }: { status: MachineStatus }) {
  return (
    <Badge tone={machineTone[status]} dot>
      {humanize(status)}
    </Badge>
  );
}

const sessionTone: Record<SessionStatus, BadgeTone> = {
  CREATED: 'neutral',
  ACTIVE: 'blue',
  PAUSED: 'amber',
  COMPLETED: 'green',
  CANCELLED: 'red',
  EXPIRED: 'purple',
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge tone={sessionTone[status]} dot>
      {humanize(status)}
    </Badge>
  );
}

const paymentTone: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'amber',
  PAID: 'green',
  REFUNDED: 'purple',
  VOIDED: 'red',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={paymentTone[status]} dot>
      {humanize(status)}
    </Badge>
  );
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge tone={status === 'ACTIVE' ? 'green' : 'red'} dot>
      {humanize(status)}
    </Badge>
  );
}
