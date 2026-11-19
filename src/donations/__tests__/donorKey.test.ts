import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import { hashDonorKey } from '../donorKey';
import { DonationError } from '../errors';

const key = Buffer.alloc(32, 7);
const encoded = key.toString('base64url');

const errorCode = (header: string | undefined) => {
  try {
    hashDonorKey(header);
  } catch (error) {
    return error instanceof DonationError ? `${error.status} ${error.code}` : 'other';
  }
  return 'ok';
};

describe('hashDonorKey (T036)', () => {
  it('liefert den SHA-256-Hash der 32 Schlüsselbytes als Hex', () => {
    expect(hashDonorKey(`DonorKey ${encoded}`)).toBe(
      crypto.createHash('sha256').update(Uint8Array.from(key)).digest('hex'),
    );
    expect(hashDonorKey(`DonorKey ${encoded}`)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['fehlender Header', undefined],
    ['falsches Schema', `Bearer ${encoded}`],
    ['Kleinschreibung', `donorkey ${encoded}`],
    ['leerer Schlüssel', 'DonorKey '],
    ['31 Byte', `DonorKey ${Buffer.alloc(31, 1).toString('base64url')}`],
    ['33 Byte', `DonorKey ${Buffer.alloc(33, 1).toString('base64url')}`],
    ['Standard-Base64 mit Padding', `DonorKey ${key.toString('base64')}`],
    ['Zeichen außerhalb base64url', `DonorKey ${encoded.slice(0, 42)}+`],
  ])('lehnt %s mit 401 invalid_donor_key ab', (_name, header) => {
    expect(errorCode(header)).toBe('401 invalid_donor_key');
  });
});
