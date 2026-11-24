import { config } from '../config/env';
import { logger } from '../utils/logger';
import { dispatchExpiryWarnings, expireDueSessions } from './sessionExpiry';
import { checkLowCashAlerts } from './lowCashAlert';

let expiryTimer: NodeJS.Timeout | null = null;
let warningTimer: NodeJS.Timeout | null = null;
let cashAlertTimer: NodeJS.Timeout | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await expireDueSessions();
  } catch (error) {
    logger.error('Session expiry job failed', { error: String(error) });
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (expiryTimer) return;

  // Reconcile anything that expired while the server was down.
  void tick();

  expiryTimer = setInterval(tick, config.sessionExpiryIntervalMs);
  warningTimer = setInterval(() => {
    dispatchExpiryWarnings().catch((error) =>
      logger.error('Expiry warning job failed', { error: String(error) }),
    );
  }, 30_000);

  cashAlertTimer = setInterval(() => {
    checkLowCashAlerts().catch((error) =>
      logger.error('Low cash alert job failed', { error: String(error) }),
    );
  }, 15 * 60 * 1000);

  expiryTimer.unref?.();
  warningTimer.unref?.();
  cashAlertTimer.unref?.();
  logger.info('Session scheduler started', { intervalMs: config.sessionExpiryIntervalMs });
}

export function stopScheduler(): void {
  if (expiryTimer) clearInterval(expiryTimer);
  if (warningTimer) clearInterval(warningTimer);
  if (cashAlertTimer) clearInterval(cashAlertTimer);
  expiryTimer = null;
  warningTimer = null;
  cashAlertTimer = null;
}
