import { api } from '../lib/api';
import type { GamePackage, Meta, PackageScope, PackageStatus } from '../types';

export interface PackageListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PackageStatus;
  scope?: PackageScope;
  categoryId?: string;
}

export async function listPackages(
  params: PackageListParams = {},
): Promise<{ items: GamePackage[]; meta: Meta }> {
  const response = await api.get<{ success: boolean; data: GamePackage[]; meta: Meta }>('/packages', {
    params,
  });
  return { items: response.data.data, meta: response.data.meta };
}

export async function getPackage(id: string): Promise<GamePackage & { stats: {
  sessions: number;
  payments: number;
  revenueSantim: number;
  lastUsedAt: string | null;
} }> {
  const response = await api.get(`/packages/${id}`);
  return response.data.data;
}

export interface PackageInput {
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceSantim: number;
  status?: PackageStatus;
  scope?: PackageScope;
  categoryId?: string | null;
  machineIds?: string[];
  displayOrder?: number;
}

export async function createPackage(input: PackageInput): Promise<GamePackage> {
  const response = await api.post<{ success: boolean; data: GamePackage }>('/packages', input);
  return response.data.data;
}

export async function updatePackage(id: string, input: Partial<PackageInput>): Promise<GamePackage> {
  const response = await api.patch<{ success: boolean; data: GamePackage }>(`/packages/${id}`, input);
  return response.data.data;
}

export async function deletePackage(id: string): Promise<void> {
  await api.delete(`/packages/${id}`);
}
