import nodemailer from 'nodemailer';
import type { DonationConfig } from '../config';
import { donationLog } from '../log';

export interface DonationMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: DonationMail): Promise<void>;
}

/** Zeitlimits, damit ein hängender SMTP-Server keine Webhook-Verarbeitung minutenlang blockiert. */
const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

/**
 * Versand der Spendenbestätigungen (FR-018) über das SMTP-Postfach des Vereins.
 * Ohne `SMTP_URL` (lokale Entwicklung) werden Mails nicht versendet, sondern nur protokolliert –
 * ohne Empfängeradresse (Prinzip I).
 */
export const createMailer = (config: DonationConfig['mail']): Mailer => {
  if (!config.smtpUrl) {
    return {
      async send() {
        donationLog.info('E-Mail nicht versendet: SMTP_URL ist nicht gesetzt');
      },
    };
  }

  // `url` statt String-Argument, damit die Zeitlimits zusätzlich gelten (smtp-transport führt beides zusammen).
  const transport = nodemailer.createTransport({ url: config.smtpUrl, ...SMTP_TIMEOUTS });
  return {
    async send(mail) {
      await transport.sendMail({
        from: config.from,
        replyTo: config.replyTo ?? undefined,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
};

/**
 * Testmodus (Stripe-Testschlüssel, z. B. internal): Jeder kann dort mit Testkarten „spenden". Damit
 * darüber keine echten Bestätigungen an beliebige Adressen gehen, nur an freigegebene Domains bzw.
 * Adressen (`DONATION_TEST_MAIL_ALLOWLIST`) versenden.
 */
export const restrictToTestRecipients = (mailer: Mailer, allowlist: string[]): Mailer => ({
  async send(mail) {
    const to = mail.to.trim().toLowerCase();
    const domain = to.slice(to.lastIndexOf('@') + 1);
    if (allowlist.includes(to) || allowlist.includes(domain)) {
      await mailer.send(mail);
      return;
    }
    donationLog.info('Testmodus: E-Mail an nicht freigegebene Adresse unterdrückt');
  },
});
