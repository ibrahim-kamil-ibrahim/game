import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import {
  clearRefreshCookie,
  isMobileClient,
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
} from '../../utils/cookies';
import { changeOwnPassword, getCurrentUser, login, logout, rotateRefreshToken } from './authService';

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(64),
  password: z.string().min(1, 'Password is required').max(200),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const result = await login(username, password, req);
    const maxAgeMs = config.jwt.refreshTtlDays * 86400000;

    // Browsers receive the refresh token as an httpOnly cookie. Mobile clients
    // explicitly request it in the JSON payload for secure storage.
    setRefreshCookie(res, result.refreshToken, maxAgeMs);
    const mobile = isMobileClient(req.headers['x-client-type']);

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: mobile ? result.refreshToken : undefined,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      },
    });
  }),
);

router.post(
  '/refresh',
  authLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const token =
      req.body.refreshToken || (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined);
    if (!token) throw AppError.unauthorized('No refresh token supplied', 'REFRESH_TOKEN_MISSING');

    const result = await rotateRefreshToken(token, req);
    setRefreshCookie(res, result.refreshToken, config.jwt.refreshTtlDays * 86400000);
    const mobile = isMobileClient(req.headers['x-client-type']);

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: mobile ? result.refreshToken : undefined,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      },
    });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token =
      (req.body?.refreshToken as string | undefined) ??
      (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined);
    await logout(token);
    clearRefreshCookie(res);
    res.json({ success: true, data: { message: 'Signed out successfully' } });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req.user!.id);
    res.json({ success: true, data: { user } });
  }),
);

router.patch(
  '/password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await changeOwnPassword(req.user!.id, currentPassword, newPassword, req);
    clearRefreshCookie(res);
    res.json({
      success: true,
      data: { message: 'Password updated. Please sign in again with your new password.' },
    });
  }),
);

export default router;
