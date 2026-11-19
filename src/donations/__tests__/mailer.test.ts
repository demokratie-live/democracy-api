import { describe, it, expect, vi } from 'vitest';
import { restrictToTestRecipients } from '../mail/mailer';

const mail = (to: string) => ({ to, subject: 'Danke', text: 'Hallo' });

describe('Mails im Stripe-Testmodus', () => {
  it('versendet nur an freigegebene Domains und Adressen', async () => {
    const inner = { send: vi.fn(async (_mail: { to: string }) => undefined) };
    const mailer = restrictToTestRecipients(inner, ['example.org', 'kassenwart@democracy-deutschland.de']);

    await mailer.send(mail('pate@Example.org'));
    await mailer.send(mail('kassenwart@democracy-deutschland.de'));
    await mailer.send(mail('opfer@gmail.com'));
    await mailer.send(mail('andere@democracy-deutschland.de'));
    await mailer.send(mail('trick@example.org.evil.com'));

    expect(inner.send.mock.calls.map(([sent]) => sent.to)).toEqual([
      'pate@Example.org',
      'kassenwart@democracy-deutschland.de',
    ]);
  });

  it('versendet ohne Freigabeliste gar nichts', async () => {
    const inner = { send: vi.fn(async () => undefined) };
    await restrictToTestRecipients(inner, []).send(mail('pate@example.org'));
    expect(inner.send).not.toHaveBeenCalled();
  });
});
