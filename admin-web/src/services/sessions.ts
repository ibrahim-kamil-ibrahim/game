import { api } from '../lib/api';
import type { Meta, Session, SessionEvent, SessionStatus } from '../types';

export interface SessionListParams {
  page?: number;
  pageSize?: number;
  status?: SessionStatus;
  machineId?: string;
  employerId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function startSession(paymentId: string): Promise<Session> {
  const response = await api.post<{ success: boolean; data: { session: Session; serverTime: string } }>(
    '/sessions/start',
    { paymentId },
  );
  return response.data.data.session;
}

export async function listSessions(
  params: SessionListParams = {},
): Promise<{ items: Session[]; meta: Meta; summary: { sessionRevenueSantim: number }; serverTime: string }> {
  const response = await api.get<{
    success: boolean;
    data: Session[];
    meta: Meta;
    summary: { sessionRevenueSantim: number };
    serverTime: string;
  }>('/sessions', { params });
  return {
    items: response.data.data,
    meta: response.data.meta,
    summary: response.data.summary,
    serverTime: response.data.serverTime,
  };
}

export async function getSession(
  id: string,
): Promise<{ session: Session; events: SessionEvent[]; serverTime: string }> {
  const response = await api.get(`/sessions/${id}`);
  return response.data.data;
}

export async function endSession(id: string, reason?: string): Promise<Session> {
  const response = await api.post(`/sessions/${id}/end`, { reason });
  return response.data.data;
}

export async function cancelSession(id: string, reason?: string): Promise<Session> {
  const response = await api.post(`/sessions/${id}/cancel`, { reason });
  return response.data.data;
}

export async function pauseSession(id: string): Promise<Session> {
  const response = await api.post(`/sessions/${id}/pause`);
  return response.data.data;
}

export async function resumeSession(id: string): Promise<Session> {
  const response = await api.post(`/sessions/${id}/resume`);
  return response.data.data;
}

export async function extendSession(
  id: string,
  packageId: string,
  idempotencyKey?: string,
): Promise<Session> {
  const response = await api.post(`/sessions/${id}/extend`, { packageId, idempotencyKey });
  return response.data.data;
}
