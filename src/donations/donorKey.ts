import crypto from 'crypto';
import { DonationError } from './errors';

/**
 * Spender-Schlüssel (research.md R8): 32 Zufallsbytes, nur auf dem Gerät gespeichert, im Header
 * `Authorization: DonorKey <base64url>` übertragen. Der Server kennt nur den SHA-256-Hash.
 */

const PREFIX = 'DonorKey ';
const BASE64URL = /^[A-Za-z0-9_-]{43}$/; // 32 Byte → 43 Zeichen ohne Padding

export const hashDonorKey = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader?.startsWith(PREFIX)) {
    throw new DonationError('invalid_donor_key');
  }
  const encoded = authorizationHeader.slice(PREFIX.length).trim();
  if (!BASE64URL.test(encoded)) {
    throw new DonationError('invalid_donor_key');
  }
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32) {
    throw new DonationError('invalid_donor_key');
  }
  // Kopie als Uint8Array: Die Buffer-Typen von @types/node passen nicht zu BinaryLike (TS 5.7+).
  return crypto.createHash('sha256').update(Uint8Array.from(key)).digest('hex');
};
