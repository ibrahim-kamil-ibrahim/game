import crypto from 'node:crypto';
import { config } from '../config/env';
import type { TransactionClient } from '../config/database';
import { AppError } from '../utils/errors';

const QR_PREFIX = 'grs:v1:';

/**
 * Machine QR payloads contain a 192-bit random secret. The database only stores
 * an HMAC of that secret, so a leaked database cannot be used to forge codes and
 * the identifier is not derived from a guessable database id.
 */
export function generateMachineQrToken(): { token: string; tokenHash: string; tokenHint: string } {
  const secret = crypto.randomBytes(24).toString('base64url');
  return {
    token: secret,
    tokenHash: hashQrToken(secret),
    tokenHint: secret.slice(-6),
  };
}

export function hashQrToken(rawToken: string): string {
  const normalized = normalizeQrPayload(rawToken);
  return crypto.createHmac('sha256', config.qrHmacSecret).update(normalized).digest('hex');
}

export function normalizeQrPayload(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith(QR_PREFIX)) return trimmed.slice(QR_PREFIX.length);
  return trimmed;
}

/** The exact string that is rendered into the QR code image. */
export function qrImagePayload(rawToken: string): string {
  return `${QR_PREFIX}${rawToken}`;
}

/**
 * Verifies that the supplied QR payload is active and belongs to the target
 * machine. Used to enforce physical presence at the machine when an employer
 * starts or ends a session.
 */
export async function requireValidMachineQr(
  tx: TransactionClient,
  machineId: string,
  rawToken: string | undefined,
): Promise<void> {
  const normalized = rawToken ? normalizeQrPayload(rawToken) : '';
  if (!normalized) {
    throw AppError.badRequest(
      'Scanning the machine QR code is required for this action',
      undefined,
      'QR_REQUIRED',
    );
  }
  const tokenHash = hashQrToken(normalized);
  const record = await tx.machineQRCode.findFirst({
    where: { tokenHash, isActive: true },
    select: { machineId: true },
  });
  if (!record || record.machineId !== machineId) {
    throw AppError.forbidden(
      'The scanned QR code does not match this machine',
      'QR_MISMATCH',
    );
  }
}
