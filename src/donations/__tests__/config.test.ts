import { afterEach, describe, it, expect } from 'vitest';
import { buildDeps, startServer, testEnv, readJson } from './helpers';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

describe('GET /donations/v1/config', () => {
  it('liefert die öffentliche Konfiguration gemäß Contract, cachebar für 5 Minuten', async () => {
    const server = await startServer(buildDeps());
    close = server.close;

    const response = await fetch(`${server.url}/config`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');

    const body = await readJson(response);
    expect(body).toEqual({
      enabled: true,
      publishableKey: 'pk_test_dummy',
      merchantDisplayName: 'DEMOCRACY Deutschland e.V.',
      merchantCountryCode: 'DE',
      defaultInterval: 'monthly',
      minAmountCents: 500,
      maxAmountCents: 100000,
      presets: { one_time: [1000, 2500, 5000, 10000], monthly: [500, 1000, 1500, 2500] },
      paymentMethodTypes: { one_time: ['card', 'sepa_debit', 'paypal'], monthly: ['card', 'sepa_debit'] },
      fees: { cardPct: 1.5, cardFixedCents: 25, sepaFixedCents: 35, billingPct: 0.7 },
      portalLoginUrl: 'https://billing.stripe.com/p/login/test_abc',
      bankTransfer: { holder: 'DEMOCRACY Deutschland e.V.', iban: 'DE83 2605 0001 0056 1290 91', bic: 'NOLADE21GOE' },
      legal: {
        privacyUrl: 'https://www.democracy-deutschland.de/datenschutz',
        nonprofitProofUrl: 'https://www.democracy-deutschland.de/files/download/Gemeinnutzigkeit_DEMOCRACY.pdf',
        simplifiedReceiptUrl:
          'https://www.democracy-deutschland.de/files/download/Vereinfachter_Zuwendungsnachweis.pdf',
      },
    });
  });

  it('gibt niemals geheime Schlüssel heraus', async () => {
    const server = await startServer(buildDeps());
    close = server.close;

    const text = await (await fetch(`${server.url}/config`)).text();
    expect(text).not.toContain(testEnv.STRIPE_SECRET_KEY);
    expect(text).not.toContain(testEnv.STRIPE_WEBHOOK_SECRET);
  });

  it('meldet den Kill-Switch und verschweigt dann auch den Publishable Key', async () => {
    const server = await startServer(buildDeps({}, { ...testEnv, DONATIONS_ENABLED: 'false' }));
    close = server.close;

    const body = await readJson(await fetch(`${server.url}/config`));
    expect(body.enabled).toBe(false);
    expect(body.publishableKey).toBeNull();
    expect(body.bankTransfer.iban).toBe('DE83 2605 0001 0056 1290 91');
  });
});
