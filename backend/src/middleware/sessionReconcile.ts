import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { expireDueSessions } from '../jobs/sessionExpiry';
import { logger } from '../utils/logger';

let lastReconciledAt = 0;
let inFlight: Promise<unknown> | null = null;

/**
 * Reconciles overdue sessions before serving API traffic, at most once per
 * scheduler interval. This is the reliability mechanism for sleeping hosts
 * (Render free): the first request after a wake-up expires anything that ended
 * while the process was asleep, before the caller reads session/dashboard data.
 *
 * The in-process scheduler still handles normal continuous operation.
 */
export async function reconcileExpiredSessions(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (config.isTest) {
    next();
    return;
  }

  const now = Date.now();
  if (inFlight) {
    await inFlight;
    next();
    return;
  }
  if (now - lastReconciledAt < config.sessionExpiryIntervalMs) {
    next();
    return;
  }

  inFlight = expireDueSessions(new Date(), 50)
    .then((result) => {
      if (result.expired > 0) {
        logger.info('Reconciled expired sessions before API request', { count: result.expired });
      }
    })
    .catch((error) => {
      // Never block business requests because reconciliation failed; the
      // scheduler and the next request will retry.
      logger.error('Pre-request session reconciliation failed', { error: String(error) });
    })
    .finally(() => {
      lastReconciledAt = Date.now();
      inFlight = null;
    });

  await inFlight;
  next();
}
