import { logger } from '../services/logger';

/**
 * Logging für das Spendenmodul (research.md R10, Constitution Prinzip I).
 *
 * Erlaubt sind ausschließlich technische Kennungen – bewusst über einen engen Typ erzwungen:
 * keine IP-Adressen, keine User-Agents, keine E-Mail-Adressen, keine Namen, keine Request-Bodies.
 */
interface SafeMeta {
  /** Stripe-Objekt-ID, z. B. pi_…, sub_…, in_… */
  stripeId?: string;
  /** Stripe-Event-ID evt_… */
  eventId?: string;
  eventType?: string;
  /** Fehler- oder Statuscode, z. B. DonationErrorCode oder Stripe-Fehlercode */
  code?: string;
}

const write = (level: 'info' | 'warn' | 'error', message: string, meta: SafeMeta = {}) => {
  logger.log(level, `[donations] ${message}`, { ...meta });
};

export const donationLog = {
  info: (message: string, meta?: SafeMeta) => write('info', message, meta),
  warn: (message: string, meta?: SafeMeta) => write('warn', message, meta),
  error: (message: string, meta?: SafeMeta) => write('error', message, meta),
};
