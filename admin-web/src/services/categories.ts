import { api } from '../lib/api';
import type { Category } from '../types';

export async function listCategories(): Promise<Category[]> {
  const response = await api.get<{ success: boolean; data: Category[] }>('/categories');
  return response.data.data;
}

export async function createCategory(input: {
  name: string;
  description?: string;
  isActive?: boolean;
}): Promise<Category> {
  const response = await api.post<{ success: boolean; data: Category }>('/categories', input);
  return response.data.data;
}

export async function updateCategory(
  id: string,
  input: { name?: string; description?: string | null; isActive?: boolean },
): Promise<Category> {
  const response = await api.patch<{ success: boolean; data: Category }>(`/categories/${id}`, input);
  return response.data.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}
