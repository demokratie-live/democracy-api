import crypto from 'crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { DonationError } from './errors';

/**
 * Rate-Limit für zahlungsauslösende Endpunkte (research.md R9/R10).
 *
 * Der Zähler-Schlüssel ist SHA-256(täglicher Zufalls-Salt + IP). Die IP selbst wird weder
 * gespeichert noch geloggt; mit dem täglich neuen Salt lassen sich Schlüssel verschiedener Tage
 * nicht verknüpfen. Speicher: nur im Prozess (Memory-Store).
 */

let salt = { day: '', value: '' };

const dailySalt = (now: Date): string => {
  const day = now.toISOString().slice(0, 10);
  if (salt.day !== day) {
    salt = { day, value: crypto.randomBytes(32).toString('hex') };
  }
  return salt.value;
};

export const hashClientKey = (normalizedIp: string, now = new Date()): string =>
  crypto.createHash('sha256').update(dailySalt(now)).update(normalizedIp).digest('hex');

export const createPaymentRateLimiter = ({ windowMs = 10 * 60 * 1000, limit = 10 } = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // ipKeyGenerator fasst IPv6-Adressen auf ihr /56-Netz zusammen, bevor gehasht wird.
    keyGenerator: (req) => hashClientKey(ipKeyGenerator(req.ip ?? 'unknown')),
    handler: (_req, res) => {
      const error = new DonationError('rate_limited');
      res.status(error.status).json(error.toBody());
    },
  });
