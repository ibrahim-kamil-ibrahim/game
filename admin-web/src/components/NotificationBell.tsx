import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, CircleAlert, Clock3, CreditCard, Gamepad2, Info, UserPlus } from 'lucide-react';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications';
import { formatDateTime } from '../lib/utils';
import { cn } from '../lib/utils';

const icons: Record<string, typeof Info> = {
  SESSION_STARTED: Gamepad2,
  SESSION_EXPIRED: Clock3,
  SESSION_EXPIRING: Clock3,
  SESSION_ENDED: Clock3,
  SESSION_EXTENDED: Clock3,
  PAYMENT_RECORDED: CreditCard,
  EMPLOYER_ACTIVITY: UserPlus,
  SYSTEM: CircleAlert,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => listNotifications({ page: 1, pageSize: 8 }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const unread = query.data?.unreadCount ?? 0;

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-icon relative"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-navy-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-navy-900">Notifications</p>
              <p className="text-xs text-navy-500">{unread} unread</p>
            </div>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleMarkAll}
              disabled={unread === 0}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {query.data?.items.length ? (
              query.data.items.map((item) => {
                const Icon = icons[item.type] ?? Info;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full gap-3 border-b border-navy-50 px-4 py-3 text-left transition hover:bg-navy-50',
                      !item.readAt && 'bg-brand-50/40',
                    )}
                    onClick={async () => {
                      if (!item.readAt) {
                        await markNotificationRead(item.id);
                        await queryClient.invalidateQueries({ queryKey: ['notifications'] });
                      }
                      setOpen(false);
                      navigate('/notifications');
                    }}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-navy-900">{item.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-navy-500">{item.body}</span>
                      <span className="mt-1 block text-[11px] text-navy-400">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-4 py-10 text-center text-sm text-navy-400">No notifications yet</p>
            )}
          </div>

          <Link
            to="/notifications"
            className="block border-t border-navy-100 px-4 py-3 text-center text-xs font-semibold text-brand-600 hover:bg-navy-50"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
