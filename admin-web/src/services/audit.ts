import { api } from '../lib/api';
import type { AuditLogItem, Meta } from '../types';

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listAuditLogs(
  params: AuditListParams = {},
): Promise<{ items: AuditLogItem[]; meta: Meta; filters: { actions: string[] } }> {
  const response = await api.get<{
    success: boolean;
    data: AuditLogItem[];
    meta: Meta;
    filters: { actions: string[] };
  }>('/admin/audit-logs', { params });
  return {
    items: response.data.data,
    meta: response.data.meta,
    filters: response.data.filters,
  };
}
