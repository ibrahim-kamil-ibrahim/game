import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuthStore } from '../stores/auth';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function businessTimezone(): string {
  return useAuthStore.getState().user?.business.timezone ?? 'Africa/Addis_Ababa';
}

export function formatEtb(santim: number | null | undefined, withSuffix = true): string {
  const value = (santim ?? 0) / 100;
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSuffix ? `${formatted} ETB` : formatted;
}

export function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('en-US');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: businessTimezone(),
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: businessTimezone(),
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: businessTimezone(),
    timeStyle: 'short',
  }).format(new Date(value));
}

/** Format seconds as mm:ss (or hh:mm:ss when >= 1 hour). */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: businessTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybeAxios = error as {
      response?: { data?: { error?: { message?: string; details?: unknown } } };
      message?: string;
    };
    const apiMessage = maybeAxios.response?.data?.error?.message;
    if (apiMessage) return apiMessage;
    if (maybeAxios.message) return maybeAxios.message;
  }
  return 'Something went wrong. Please try again.';
}

const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*';

function secureRandomInt(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

export function generateEmployerUsername(fullName: string): string {
  const slug = fullName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 20);
  const suffix = Array.from({ length: 5 })
    .map(() => SAFE_ALPHABET[secureRandomInt(SAFE_ALPHABET.length)].toLowerCase())
    .join('');
  return `${slug || 'employer'}-${suffix}`;
}

export function generateEmployerPassword(length = 14): string {
  const chars: string[] = [
    SAFE_ALPHABET[secureRandomInt(SAFE_ALPHABET.length)],
    DIGITS[secureRandomInt(DIGITS.length)],
    SYMBOLS[secureRandomInt(SYMBOLS.length)],
  ];
  const all = `${SAFE_ALPHABET}${DIGITS}${SYMBOLS}`;
  while (chars.length < length) chars.push(all[secureRandomInt(all.length)]);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = secureRandomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join('');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy clipboard path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
