import { api } from '../lib/api';
import type { AnalyticsData, DashboardData } from '../types';

export async function getDashboard(): Promise<DashboardData> {
  const response = await api.get<{ success: boolean; data: DashboardData }>('/admin/dashboard');
  return response.data.data;
}

export async function getAnalytics(params: {
  from?: string;
  to?: string;
  granularity?: 'day' | 'week' | 'month';
}): Promise<AnalyticsData> {
  const response = await api.get<{ success: boolean; data: AnalyticsData }>('/admin/dashboard/analytics', {
    params,
  });
  return response.data.data;
}
