import type { Response } from 'express';
import { config } from '../config/env';

export const REFRESH_COOKIE_NAME = 'grs_refresh';

export function setRefreshCookie(res: Response, token: string, maxAgeMs: number) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/api/v1/auth',
    maxAge: maxAgeMs,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/api/v1/auth',
  });
}

/** Mobile clients ask for the refresh token in the JSON body. */
export function isMobileClient(headerValue: unknown): boolean {
  return typeof headerValue === 'string' && headerValue.toLowerCase() === 'mobile';
}
