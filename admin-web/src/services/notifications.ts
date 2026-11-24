import { api } from '../lib/api';
import type { Meta, NotificationItem } from '../types';

export async function listNotifications(
  params: { page?: number; pageSize?: number; unreadOnly?: boolean } = {},
): Promise<{ items: NotificationItem[]; meta: Meta; unreadCount: number }> {
  const response = await api.get<{
    success: boolean;
    data: NotificationItem[];
    meta: Meta;
    unreadCount: number;
  }>('/notifications', { params });
  return {
    items: response.data.data,
    meta: response.data.meta,
    unreadCount: response.data.unreadCount,
  };
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
  const response = await api.post(`/notifications/${id}/read`);
  return response.data.data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all');
}
