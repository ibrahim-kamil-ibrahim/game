import { api } from '../lib/api';
import type { Meta, Payment, PaymentStatus, PaymentType } from '../types';

export interface PaymentListParams {
  page?: number;
  pageSize?: number;
  status?: PaymentStatus;
  type?: PaymentType;
  machineId?: string;
  employerId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listPayments(
  params: PaymentListParams = {},
): Promise<{ items: Payment[]; meta: Meta; summary: { collectedSantim: number; paidTransactions: number } }> {
  const response = await api.get<{
    success: boolean;
    data: Payment[];
    meta: Meta;
    summary: { collectedSantim: number; paidTransactions: number };
  }>('/payments', { params });
  return { items: response.data.data, meta: response.data.meta, summary: response.data.summary };
}

export async function getPayment(id: string): Promise<Payment & { extension: unknown; session: unknown }> {
  const response = await api.get(`/payments/${id}`);
  return response.data.data;
}

export interface CreateCashPaymentInput {
  machineId: string;
  packageId: string;
  idempotencyKey: string;
  employerId?: string;
  notes?: string;
}

export async function createCashPayment(input: CreateCashPaymentInput): Promise<Payment> {
  const response = await api.post<{ success: boolean; data: Payment }>('/payments/cash', input);
  return response.data.data;
}

export async function voidPayment(id: string, reason: string): Promise<Payment> {
  const response = await api.post<{ success: boolean; data: Payment }>(`/payments/${id}/void`, { reason });
  return response.data.data;
}

export async function refundPayment(id: string, reason: string): Promise<Payment> {
  const response = await api.post<{ success: boolean; data: Payment }>(`/payments/${id}/refund`, { reason });
  return response.data.data;
}
