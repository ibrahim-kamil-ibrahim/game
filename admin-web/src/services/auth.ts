import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import type { AuthUser } from '../types';

interface SessionPayload {
  user: AuthUser;
  accessToken: string;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const response = await api.post<{ success: boolean; data: SessionPayload }>('/auth/login', {
    username,
    password,
  });
  useAuthStore.getState().setSession(response.data.data.user, response.data.data.accessToken);
  return response.data.data.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    useAuthStore.getState().clear();
  }
}

export async function fetchMe(): Promise<AuthUser> {
  const response = await api.get<{ success: boolean; data: { user: AuthUser } }>('/auth/me');
  const user = response.data.data.user;
  useAuthStore.getState().setUser(user);
  return user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.patch('/auth/password', { currentPassword, newPassword });
  useAuthStore.getState().clear();
}
