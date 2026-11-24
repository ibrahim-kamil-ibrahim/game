import { api } from '../lib/api';
import type { Expense, ExpenseCategory, Meta } from '../types';

export interface ExpenseListParams {
  page?: number;
  pageSize?: number;
  category?: ExpenseCategory;
  from?: string;
  to?: string;
  search?: string;
}

export async function listExpenses(
  params: ExpenseListParams = {},
): Promise<{
  items: Expense[];
  meta: Meta;
  summary: {
    totalSantim: number;
    byCategory: Array<{ category: ExpenseCategory; amountSantim: number; count: number }>;
  };
}> {
  const response = await api.get<{
    success: boolean;
    data: Expense[];
    meta: Meta;
    summary: {
      totalSantim: number;
      byCategory: Array<{ category: ExpenseCategory; amountSantim: number; count: number }>;
    };
  }>('/expenses', { params });
  return { items: response.data.data, meta: response.data.meta, summary: response.data.summary };
}

export interface ExpenseInput {
  title: string;
  category: ExpenseCategory;
  amountSantim: number;
  description?: string;
  expenseDate: string;
  receiptUrl?: string;
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const response = await api.post<{ success: boolean; data: Expense }>('/expenses', input);
  return response.data.data;
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>): Promise<Expense> {
  const response = await api.patch<{ success: boolean; data: Expense }>(`/expenses/${id}`, input);
  return response.data.data;
}

export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/expenses/${id}`);
}
