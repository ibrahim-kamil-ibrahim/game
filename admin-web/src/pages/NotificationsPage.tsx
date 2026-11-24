import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, CircleAlert, Clock3, CreditCard, Gamepad2, Info, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications';
import { PageHeader, SectionCard } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { Tabs } from '../components/ui/Layout';
import { cn, errorMessage, formatDateTime, humanize } from '../lib/utils';

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

type Filter = 'ALL' | 'UNREAD';

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['notifications', 'page', filter, page],
    queryFn: () => listNotifications({ page, pageSize: 20, unreadOnly: filter === 'UNREAD' }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      toast.success('All notifications marked as read');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Session, payment and employer activity alerts"
        actions={
          <Button
            variant="secondary"
            icon={<CheckCheck className="h-4 w-4" />}
            loading={readAllMutation.isPending}
            onClick={() => readAllMutation.mutate()}
            disabled={(query.data?.unreadCount ?? 0) === 0}
          >
            Mark all read
          </Button>
        }
      />

      <Tabs
        tabs={[
          { id: 'ALL', label: 'All notifications' },
          { id: 'UNREAD', label: 'Unread', count: query.data?.unreadCount },
        ]}
        active={filter}
        onChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
      />

      <SectionCard padded={false}>
        {query.isLoading ? (
          <TableSkeleton columns={3} rows={8} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title={filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
            description="Alerts about sessions, payments and employer activity will appear here."
          />
        ) : (
          <div className="divide-y divide-navy-100">
            {query.data?.items.map((item) => {
              const Icon = icons[item.type] ?? Info;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => !item.readAt && readMutation.mutate(item.id)}
                  className={cn(
                    'flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-navy-50/70',
                    !item.readAt && 'bg-brand-50/30',
                  )}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-100 text-navy-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-navy-900">{item.title}</span>
                      <Badge tone={item.readAt ? 'neutral' : 'blue'}>{item.readAt ? 'Read' : 'New'}</Badge>
                      <span className="text-[10px] font-semibold tracking-wider text-navy-400 uppercase">
                        {humanize(item.type)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-navy-600">{item.body}</span>
                    <span className="mt-1 block text-[11px] text-navy-400">{formatDateTime(item.createdAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {query.data?.meta ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </SectionCard>
    </div>
  );
}
