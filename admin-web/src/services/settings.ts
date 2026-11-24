import { api } from '../lib/api';
import type { Business, BusinessSettings } from '../types';

export interface SettingsResponse {
  business: Business;
  settings: BusinessSettings;
}

export async function getSettings(): Promise<SettingsResponse> {
  const response = await api.get<{ success: boolean; data: SettingsResponse }>('/settings');
  return response.data.data;
}

export interface UpdateSettingsInput {
  allowExtension?: boolean;
  allowPause?: boolean;
  allowManualEnd?: boolean;
  requireEndReason?: boolean;
  expiryWarningMinutes?: number;
  lowCashThresholdSantim?: number | null;
  businessName?: string;
  businessPhone?: string | null;
  businessAddress?: string | null;
  timezone?: string;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<SettingsResponse> {
  const response = await api.patch<{ success: boolean; data: SettingsResponse }>('/settings', input);
  return response.data.data;
}
