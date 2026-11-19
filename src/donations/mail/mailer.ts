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

  const transport = nodemailer.createTransport(config.smtpUrl);
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
