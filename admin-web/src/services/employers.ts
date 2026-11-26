import { api } from '../lib/api';
import type { EmployerDetail, EmployerListItem, Meta, SessionStatus, PaymentStatus, UserStatus } from '../types';

export interface EmployerListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: UserStatus;
}

export async function listEmployers(
  params: EmployerListParams = {},
): Promise<{ items: EmployerListItem[]; meta: Meta }> {
  const response = await api.get<{ success: boolean; data: EmployerListItem[]; meta: Meta }>(
    '/admin/employers',
    { params },
  );
  return { items: response.data.data, meta: response.data.meta };
}

export async function getEmployer(id: string): Promise<EmployerDetail> {
  const response = await api.get(`/admin/employers/${id}`);
  return response.data.data;
}

export async function createEmployer(input: {
  fullName: string;
  username?: string;
  phone?: string;
  password?: string;
}): Promise<EmployerListItem & { temporaryPassword: string }> {
  const response = await api.post('/admin/employers', input);
  return response.data.data;
}

export async function updateEmployer(
  id: string,
  input: { fullName?: string; username?: string; phone?: string | null },
): Promise<EmployerListItem> {
  const response = await api.patch(`/admin/employers/${id}`, input);
  return response.data.data;
}

export async function setEmployerStatus(id: string, status: UserStatus): Promise<EmployerListItem> {
  const response = await api.patch(`/admin/employers/${id}/status`, { status });
  return response.data.data;
}

export async function deleteEmployer(id: string): Promise<{ deleted: boolean }> {
  const response = await api.delete(`/admin/employers/${id}`);
  return response.data.data;
}

export async function resetEmployerPassword(
  id: string,
  newPassword?: string,
): Promise<{ message: string; username: string; temporaryPassword: string; setAt: string }> {
  const response = await api.post(`/admin/employers/${id}/reset-password`, { newPassword });
  return response.data.data;
}

export async function getEmployerActivity(
  id: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<{
  employer: { id: string; fullName: string; username: string; status: UserStatus; lastLoginAt: string | null };
  sessions: {
    items: Array<{
      id: string;
      status: SessionStatus;
      packageNameSnapshot: string;
      priceSantim: number;
      createdAt: string;
      machine: { name: string; code: string };
      payment: { transactionRef: string; amountSantim: number; status: PaymentStatus };
    }>;
    meta: Meta;
  };
  payments: {
    items: Array<{
      id: string;
      transactionRef: string;
      amountSantim: number;
      status: PaymentStatus;
      paidAt: string | null;
      packageNameSnapshot: string;
      machine: { name: string; code: string };
    }>;
    meta: Meta;
  };
  auditLogs: Array<{ id: string; action: string; entityType: string; entityId: string | null; createdAt: string }>;
}> {
  const response = await api.get(`/admin/employers/${id}/activity`, { params });
  return response.data.data;
}
