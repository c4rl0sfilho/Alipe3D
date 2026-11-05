import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** false quando não há SMTP configurado: nenhum e-mail é enviado. */
  readonly isConfigured: boolean;
  send(message: MailMessage): Promise<void>;
}

class SmtpMailer implements Mailer {
  readonly isConfigured = true;
  private readonly transporter: Transporter;

  constructor(
    config: Pick<Env, 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASSWORD'> & {
      SMTP_HOST: string;
    },
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } } : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

class DisabledMailer implements Mailer {
  readonly isConfigured = false;
  async send(): Promise<void> {
    // Sem SMTP: nada é enviado. O chamador decide a alternativa (ex.: link gerado pelo administrador).
  }
}

export function createMailer(
  config: Pick<
    Env,
    'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'SMTP_FROM'
  >,
): Mailer {
  if (!config.SMTP_HOST) return new DisabledMailer();
  return new SmtpMailer({ ...config, SMTP_HOST: config.SMTP_HOST }, config.SMTP_FROM);
}
