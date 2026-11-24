import { api, getFilenameFromHeaders } from '../lib/api';
import type {
  EmployerReport,
  ExpenseReport,
  MachineReport,
  PackageReport,
  ProfitLossReport,
  RevenueReport,
  SessionsReport,
} from '../types';

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface ReportParams {
  from?: string;
  to?: string;
  granularity?: Granularity;
  machineId?: string;
  employerId?: string;
  packageId?: string;
  status?: string;
}

async function get<T>(path: string, params: ReportParams): Promise<T> {
  const response = await api.get<{ success: boolean; data: T }>(path, { params });
  return response.data.data;
}

export const fetchRevenueReport = (params: ReportParams) => get<RevenueReport>('/reports/revenue', params);
export const fetchMachineReport = (params: ReportParams) => get<MachineReport>('/reports/machines', params);
export const fetchEmployerReport = (params: ReportParams) => get<EmployerReport>('/reports/employers', params);
export const fetchPackageReport = (params: ReportParams) => get<PackageReport>('/reports/packages', params);
export const fetchSessionsReport = (params: ReportParams) => get<SessionsReport>('/reports/sessions', params);
export const fetchExpenseReport = (params: ReportParams) => get<ExpenseReport>('/reports/expenses', params);
export const fetchProfitLossReport = (params: ReportParams) =>
  get<ProfitLossReport>('/reports/profit-loss', params);

export type ExportType = 'revenue' | 'machines' | 'employers' | 'packages' | 'sessions' | 'expenses' | 'profit-loss';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export async function exportReport(
  type: ExportType,
  format: ExportFormat,
  params: ReportParams,
): Promise<{ blob: Blob; filename: string }> {
  const response = await api.get('/reports/export', {
    params: { ...params, type, format },
    responseType: 'blob',
  });
  const filename = getFilenameFromHeaders(
    response.headers as Record<string, unknown>,
    `${type}-report.${format}`,
  );
  return { blob: response.data as Blob, filename };
}
