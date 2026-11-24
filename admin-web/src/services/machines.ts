import { api, getFilenameFromHeaders, saveBlob } from '../lib/api';
import type { Machine, MachineStatus, Meta, PaymentStatus, Session, SessionStatus } from '../types';

export interface MachineListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: MachineStatus;
  categoryId?: string;
}

export interface MachineListResult {
  items: Machine[];
  meta: Meta;
}

export async function listMachines(params: MachineListParams = {}): Promise<MachineListResult> {
  const response = await api.get<{ success: boolean; data: Machine[]; meta: Meta }>('/machines', { params });
  return { items: response.data.data, meta: response.data.meta };
}

/** All machine codes, used to suggest the next free code in the register form. */
export async function listAllMachineCodes(): Promise<string[]> {
  const codes: string[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await listMachines({ page, pageSize: 100 });
    codes.push(...result.items.map((machine) => machine.code));
    totalPages = result.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return codes;
}

export async function getMachine(id: string): Promise<{
  machine: Machine;
  packages: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceSantim: number;
    scope: string;
    categoryName: string | null;
    displayOrder: number;
  }>;
  stats: { sessionsTotal: number; revenueSantim: number };
  recentSessions: Array<{
    id: string;
    status: SessionStatus;
    packageNameSnapshot: string;
    priceSantim: number;
    createdAt: string;
    startedAt: string | null;
    endsAt: string | null;
    employer: { id: string; fullName: string };
    payment: { transactionRef: string; amountSantim: number; status: PaymentStatus };
  }>;
}> {
  const response = await api.get(`/machines/${id}`);
  return response.data.data;
}

export interface MachineInput {
  name: string;
  code: string;
  categoryId?: string | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  status?: Exclude<MachineStatus, 'IN_USE'>;
}

export async function createMachine(input: MachineInput): Promise<Machine> {
  const response = await api.post<{ success: boolean; data: Machine }>('/machines', input);
  return response.data.data;
}

export async function updateMachine(id: string, input: Partial<MachineInput>): Promise<Machine> {
  const response = await api.patch<{ success: boolean; data: Machine }>(`/machines/${id}`, input);
  return response.data.data;
}

export async function setMachineStatus(
  id: string,
  status: Exclude<MachineStatus, 'IN_USE'>,
): Promise<Machine> {
  const response = await api.patch<{ success: boolean; data: Machine }>(`/machines/${id}/status`, { status });
  return response.data.data;
}

export async function deleteMachine(id: string): Promise<void> {
  await api.delete(`/machines/${id}`);
}

export async function regenerateQr(id: string): Promise<{ version: number; hint: string; message: string }> {
  const response = await api.post(`/machines/${id}/qr/regenerate`);
  return response.data.data;
}

export async function downloadQr(id: string, machineCode: string, format: 'png' | 'pdf'): Promise<void> {
  const response = await api.get(`/machines/${id}/qr`, {
    params: { format },
    responseType: 'blob',
  });
  const filename = getFilenameFromHeaders(
    response.headers as Record<string, unknown>,
    `${machineCode}-qr.${format}`,
  );
  saveBlob(response.data as Blob, filename);
}

export async function fetchQrBlob(id: string): Promise<Blob> {
  const response = await api.get(`/machines/${id}/qr`, {
    params: { format: 'png' },
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function getMachineHistory(
  id: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<{
  machine: { id: string; name: string; code: string };
  items: Array<{
    id: string;
    status: SessionStatus;
    packageName: string;
    durationMinutes: number;
    priceSantim: number;
    startedAt: string | null;
    endsAt: string | null;
    actualEndedAt: string | null;
    actualDurationSeconds: number | null;
    employer: { id: string; fullName: string };
    payment: { transactionRef: string; amountSantim: number; status: PaymentStatus; method: string };
    extensions: Array<{ id: string; durationMinutes: number; priceSantim: number }>;
    createdAt: string;
  }>;
  meta: Meta;
}> {
  const response = await api.get(`/machines/${id}/history`, { params });
  return response.data.data;
}

export async function getMachineStats(id: string): Promise<{
  machine: { id: string; name: string; code: string };
  totals: { sessions: number; revenueSantim: number; averageDurationSeconds: number };
  daily: Array<{ date: string; sessions: number; revenueSantim: number }>;
  timezone: string;
}> {
  const response = await api.get(`/machines/${id}/stats`);
  return response.data.data;
}

export async function getLiveMachines(): Promise<{
  serverTime: string;
  machines: Machine[];
  summary: { total: number; available: number; inUse: number; maintenance: number; inactive: number };
}> {
  const response = await api.get('/machines/live');
  return response.data.data;
}

export async function getActiveSessions(): Promise<{ sessions: Session[]; serverTime: string }> {
  const response = await api.get('/sessions/active');
  return { sessions: response.data.data, serverTime: response.data.serverTime };
}
