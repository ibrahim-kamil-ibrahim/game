import axios, { AxiosError, AxiosHeaders, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth';
import type { AuthUser } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface RetriableConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // A dedicated client avoids triggering the 401 interceptor recursively.
  const response = await axios.post<{
    success: boolean;
    data: { user: AuthUser; accessToken: string };
  }>(
    `${BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true, timeout: 20_000, headers: { 'Content-Type': 'application/json' } },
  );
  const { user, accessToken } = response.data.data;
  useAuthStore.getState().setSession(user, accessToken);
  return accessToken;
}

export async function bootstrapSession(): Promise<boolean> {
  try {
    if (refreshPromise) {
      await refreshPromise;
      return true;
    }
    refreshPromise = refreshAccessToken();
    await refreshPromise;
    return true;
  } catch {
    useAuthStore.getState().clear();
    return false;
  } finally {
    refreshPromise = null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (RetriableConfig & { headers?: Record<string, string> }) | undefined;
    const isAuthEndpoint = original?.url?.includes('/auth/');
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        if (!refreshPromise) refreshPromise = refreshAccessToken();
        const token = await refreshPromise;
        const headers = AxiosHeaders.from((original.headers ?? {}) as Record<string, string>);
        headers.set('Authorization', `Bearer ${token}`);
        original.headers = headers;
        return api(original);
      } catch (refreshError) {
        useAuthStore.getState().clear();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login');
        }
        return Promise.reject(refreshError);
      } finally {
        refreshPromise = null;
      }
    }

    return Promise.reject(error);
  },
);

/** Unwraps the standard `{ success, data, meta }` envelope. */
export async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  const response = await promise;
  return response.data.data;
}

export async function downloadBlob(url: string, params?: Record<string, unknown>): Promise<Blob> {
  const response = await api.get(url, { params, responseType: 'blob' });
  return response.data as Blob;
}

export function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function getFilenameFromHeaders(headers: Record<string, unknown>, fallback: string): string {
  const disposition = headers['content-disposition'];
  if (typeof disposition === 'string') {
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    if (match?.[1]) return match[1];
  }
  return fallback;
}
