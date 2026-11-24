import { useEffect, useState } from 'react';
import { cn, formatCountdown } from '../lib/utils';

/**
 * Countdown derived from the server-provided end timestamp and the local clock
 * offset. The server returns `serverTime`; we keep the offset so a wrong device
 * clock cannot change the displayed remaining time.
 */
export function Countdown({
  endsAt,
  serverTime,
  status,
  className,
}: {
  endsAt: string | null;
  serverTime?: string;
  status: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!serverTime) return;
    setOffset(new Date(serverTime).getTime() - Date.now());
  }, [serverTime]);

  useEffect(() => {
    if (status !== 'ACTIVE' && status !== 'PAUSED') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  if (!endsAt) return <span className={className}>—</span>;

  const serverNow = now + offset;
  const remaining = Math.max(0, Math.floor((new Date(endsAt).getTime() - serverNow) / 1000));
  const urgent = remaining <= 60;
  const warning = remaining <= 300 && !urgent;

  return (
    <span
      className={cn(
        'font-mono font-semibold tabular-nums',
        urgent ? 'text-danger-600' : warning ? 'text-warning-600' : 'text-navy-900',
        className,
      )}
      aria-label={`${remaining} seconds remaining`}
    >
      {status === 'PAUSED' ? 'PAUSED' : formatCountdown(remaining)}
    </span>
  );
}
