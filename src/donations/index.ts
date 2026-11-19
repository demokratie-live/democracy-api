import express, { type ErrorRequestHandler, type RequestHandler, type Router } from 'express';
import type Stripe from 'stripe';
import { loadDonationConfig, type DonationConfig } from './config';
import { DonationError } from './errors';
import { donationLog } from './log';
import { createMailer, type Mailer } from './mail/mailer';
import { mongoWebhookEventStore, type WebhookEventStore } from './models/DonationWebhookEvent';
import { createPaymentRateLimiter } from './rateLimit';
import { configRoute } from './routes/config';
import { createStripeClient } from './stripe';
import { createWebhookHandler, type WebhookHandlers } from './webhook';

/**
 * Spendenmodul (specs/001-in-app-donations). Wird in `src/index.ts` unter `/donations/v1`
 * **vor** der Auth-Middleware eingehängt: Spenden-Requests laufen nie mit Nutzer-/Geräte-Kontext.
 */

export interface DonationsDeps {
  config: DonationConfig;
  stripe: Stripe | null;
  eventStore: WebhookEventStore;
  mailer: Mailer;
  webhookHandlers: WebhookHandlers;
}

const sendError = (res: express.Response, error: DonationError) => {
  res.status(error.status).json(error.toBody());
};

const requireEnabled =
  (config: DonationConfig): RequestHandler =>
  (_req, res, next) => {
    if (!config.enabled) {
      sendError(res, new DonationError('donations_disabled'));
      return;
    }
    next();
  };

const handleErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof DonationError) {
    sendError(res, error);
    return;
  }
  // Fehler aus express.json (ungültiges JSON, zu großer Body)
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    sendError(res, new DonationError('invalid_request'));
    return;
  }
  donationLog.error('Unerwarteter Fehler im Spendenmodul', { code: error?.code ?? error?.name ?? 'unknown' });
  sendError(res, new DonationError('internal_error'));
};

export const createDonationsRouter = (deps: DonationsDeps): Router => {
  const { config, stripe } = deps;
  const router = express.Router();

  // Der Webhook braucht den unveränderten Body für die Signaturprüfung – daher vor express.json().
  if (stripe && config.stripe.webhookSecret) {
    router.post(
      '/stripe-webhook',
      express.raw({ type: 'application/json', limit: '1mb' }),
      createWebhookHandler({
        stripe,
        webhookSecret: config.stripe.webhookSecret,
        eventStore: deps.eventStore,
        handlers: deps.webhookHandlers,
      }),
    );
  }

  router.use(express.json({ limit: '10kb' }));

  router.get('/config', configRoute(config));

  // Zahlungsauslösende Endpunkte (Implementierung in Phase 3/4): Rate-Limit und Kill-Switch zuerst.
  router.post(['/one-time', '/monthly'], createPaymentRateLimiter(), requireEnabled(config));

  // Unbekannte Pfade enden hier und laufen nie in Auth-Middleware oder GraphQL weiter.
  router.use((_req, res) => {
    res.status(404).json({ error: { code: 'invalid_request', message: 'Unbekannter Endpunkt.' } });
  });
  router.use(handleErrors);

  return router;
};

/** Baut das Modul aus den Umgebungsvariablen. Wirft bei ungültiger Konfiguration (fail fast). */
export const createDonationsRouterFromEnv = (): Router => {
  const config = loadDonationConfig();
  const stripe = config.stripe.secretKey ? createStripeClient(config.stripe.secretKey) : null;
  if (config.enabled && !config.mail.smtpUrl) {
    donationLog.warn('SMTP_URL fehlt – Spendenbestätigungen werden nicht versendet');
  }
  donationLog.info(config.enabled ? 'Spendenmodul aktiv' : 'Spendenmodul deaktiviert (DONATIONS_ENABLED=false)');
  return createDonationsRouter({
    config,
    stripe,
    eventStore: mongoWebhookEventStore,
    mailer: createMailer(config.mail),
    webhookHandlers: {},
  });
};
