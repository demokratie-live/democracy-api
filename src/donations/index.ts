import express, { type ErrorRequestHandler, type RequestHandler, type Router } from 'express';
import type Stripe from 'stripe';
import { DonationConfigError, keyMode, loadDonationConfig, type DonationConfig } from './config';
import { DonationError } from './errors';
import { createAccountAlertHandlers } from './handlers/accountAlerts';
import { createMonthlyHandlers } from './handlers/monthly';
import { createOneTimeHandlers } from './handlers/oneTime';
import { donationLog } from './log';
import { createMailer, restrictToTestRecipients, type Mailer } from './mail/mailer';
import { mongoSubscriberStore, type SubscriberStore } from './models/DonationSubscriber';
import { mongoWebhookEventStore, type WebhookEventStore } from './models/DonationWebhookEvent';
import { createManageRateLimiter, createPaymentRateLimiter } from './rateLimit';
import { configRoute } from './routes/config';
import { createManageRoutes } from './routes/manage';
import { monthlyRoute } from './routes/monthly';
import { oneTimeRoute } from './routes/oneTime';
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
  subscribers: SubscriberStore;
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

  // Zahlungsauslösende Endpunkte: gemeinsames Rate-Limit und Kill-Switch zuerst.
  // Ist das Modul aktiv, gibt es immer einen Stripe-Client (Konfigurationsprüfung beim Start).
  const paymentLimiter = createPaymentRateLimiter();
  const unavailable: RequestHandler = (_req, res) => sendError(res, new DonationError('donations_disabled'));
  router.post(
    '/one-time',
    paymentLimiter,
    requireEnabled(config),
    stripe ? oneTimeRoute({ config, stripe }) : unavailable,
  );
  router.post(
    '/monthly',
    paymentLimiter,
    requireEnabled(config),
    stripe ? monthlyRoute({ config, stripe, subscribers: deps.subscribers }) : unavailable,
  );

  // Verwalten (Spender-Schlüssel nötig): ohne Kill-Switch – Kündigen muss immer gehen. Eigenes, großzügiges
  // Rate-Limit, damit niemand über diese Endpunkte das (mit DonorBox geteilte) Stripe-Kontingent erschöpft.
  const manage = stripe ? createManageRoutes({ config, stripe, subscribers: deps.subscribers }) : null;
  const manageLimiter = createManageRateLimiter();
  router.get('/monthly', manageLimiter, manage?.get ?? unavailable);
  router.patch('/monthly', manageLimiter, manage?.update ?? unavailable);
  router.delete('/monthly', manageLimiter, manage?.cancel ?? unavailable);
  router.post('/monthly/portal-session', manageLimiter, manage?.portalSession ?? unavailable);

  // Unbekannte Pfade enden hier und laufen nie in Auth-Middleware oder GraphQL weiter.
  router.use((_req, res) => {
    res.status(404).json({ error: { code: 'invalid_request', message: 'Unbekannter Endpunkt.' } });
  });
  router.use(handleErrors);

  return router;
};

/** Antwortet auf alles mit `503 donations_disabled` – die App zeigt dann nur Bankverbindung/Status. */
const createDisabledRouter = (): Router => {
  const router = express.Router();
  router.use((_req, res) => sendError(res, new DonationError('donations_disabled')));
  return router;
};

/**
 * Baut das Modul aus den Umgebungsvariablen.
 *
 * - Modul eingeschaltet (`DONATIONS_ENABLED=true`) und Konfiguration ungültig → Fehler (fail fast): Die
 *   Pods starten nicht, der Rollout bleibt stehen, die alten Pods laufen weiter. So bleiben Webhooks und
 *   Kündigen bestehender Dauerspenden erreichbar, statt still abgeschaltet zu werden.
 * - Modul ausgeschaltet → eine fehlerhafte Spenden-Variable darf die API (Abstimmungen) nicht lahmlegen:
 *   Modul bleibt aus, der Fehler wird geloggt.
 */
export const createDonationsRouterFromEnv = (env: Record<string, string | undefined> = process.env): Router => {
  try {
    return buildFromEnv(env);
  } catch (error) {
    if (env.DONATIONS_ENABLED === 'true') throw error;
    donationLog.error('Spendenmodul bleibt aus – Konfiguration ungültig', {
      code:
        error instanceof DonationConfigError
          ? error.problems.join('; ')
          : `${(error as Error)?.name ?? 'Error'}: ${String((error as Error)?.message ?? '').slice(0, 200)}`,
    });
    return createDisabledRouter();
  }
};

const buildFromEnv = (env: Record<string, string | undefined>): Router => {
  const config = loadDonationConfig(env);
  const stripe = config.stripe.secretKey ? createStripeClient(config.stripe.secretKey) : null;
  if (config.enabled && !config.receipt.exemption) {
    donationLog.warn(
      'DONATION_RECEIPT_EXEMPTION fehlt – Bestätigungen verweisen nur auf den Gemeinnützigkeitsnachweis',
    );
  }
  const smtpMailer = createMailer(config.mail);
  const testMode = keyMode(config.stripe.secretKey) !== 'live';
  const mailer = testMode ? restrictToTestRecipients(smtpMailer, config.mail.testRecipients) : smtpMailer;
  donationLog.info(config.enabled ? 'Spendenmodul aktiv' : 'Spendenmodul deaktiviert (DONATIONS_ENABLED=false)');
  return createDonationsRouter({
    config,
    stripe,
    eventStore: mongoWebhookEventStore,
    subscribers: mongoSubscriberStore,
    mailer,
    webhookHandlers: stripe
      ? {
          ...createOneTimeHandlers({ stripe, mailer, config }),
          ...createMonthlyHandlers({ stripe, mailer, config, subscribers: mongoSubscriberStore }),
          ...createAccountAlertHandlers({ stripe }),
        }
      : {},
  });
};
