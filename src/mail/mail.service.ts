import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BrevoClient } from '@getbrevo/brevo';
import nodemailer, { type Transporter } from 'nodemailer';
import pug from 'pug';

export type MailTemplate =
  | 'welcome'
  | 'invite'
  | 'receipt'
  | 'maintenance-assigned'
  | 'password-changed'
  | 'otp';

export type MailTransportName = 'smtp' | 'brevo' | 'none';

export interface SendMailInput {
  to: string;
  subject: string;
  template: MailTemplate;
  context: Record<string, unknown>;
}

const SEND_TIMEOUT_MS = 8000;
const SEND_OVERALL_TIMEOUT_MS = 12000;

/**
 * Transactional email with Pug templates and two transports:
 * - SMTP (default when SMTP_USER/SMTP_PASS are set — e.g. Brevo's free
 *   relay smtp-relay.brevo.com:587), via nodemailer;
 * - Brevo HTTP API when BREVO_API_KEY is set.
 *
 * MAIL_TRANSPORT=smtp|brevo forces one, `auto` (default) prefers SMTP.
 * Every send is bounded by a timeout so a slow provider can never stall
 * the request that triggered the email, and a missing configuration only
 * logs a warning instead of failing (local dev / CI stay usable keyless).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly compiled = new Map<string, pug.compileTemplate>();
  private brevoClient: BrevoClient | null = null;
  private smtpTransporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  activeTransport(): MailTransportName {
    const forced = this.configService
      .get<string>('MAIL_TRANSPORT', 'auto')
      .toLowerCase();
    const smtpReady = Boolean(
      this.configService.get<string>('SMTP_USER') &&
        this.configService.get<string>('SMTP_PASS'),
    );
    const brevoReady = Boolean(
      this.configService.get<string>('BREVO_API_KEY'),
    );

    if (forced === 'smtp') {
      return smtpReady ? 'smtp' : 'none';
    }
    if (forced === 'brevo') {
      return brevoReady ? 'brevo' : 'none';
    }
    if (smtpReady) {
      return 'smtp';
    }
    return brevoReady ? 'brevo' : 'none';
  }

  isConfigured(): boolean {
    return this.activeTransport() !== 'none';
  }

  render(template: MailTemplate, context: Record<string, unknown>): string {
    let fn = this.compiled.get(template);
    if (!fn) {
      fn = pug.compileFile(join(this.templatesDir(), `${template}.pug`), {
        pretty: false,
      });
      this.compiled.set(template, fn);
    }
    return fn(context);
  }

  async send(
    input: SendMailInput,
  ): Promise<{ skipped: boolean; messageId?: string }> {
    const html = this.render(input.template, input.context);
    const transport = this.activeTransport();

    if (transport === 'none') {
      this.logger.warn(
        `Mail skipped (no SMTP_USER/SMTP_PASS or BREVO_API_KEY): to=${input.to} subject="${input.subject}"`,
      );
      return { skipped: true };
    }

    try {
      // Overall deadline on top of the per-stage timeouts: no matter which
      // stage stalls (DNS, TLS, greeting, data), the triggering request is
      // never held longer than this.
      const messageId = await this.withTimeout(
        transport === 'smtp'
          ? this.sendViaSmtp(input, html)
          : this.sendViaBrevo(input, html),
        SEND_OVERALL_TIMEOUT_MS,
        `mail to ${input.to}`,
      );
      this.logger.log(
        `Mail sent to ${input.to} via ${transport} ("${input.subject}")`,
      );
      return { skipped: false, messageId };
    } catch (error) {
      this.logger.error(
        `Mail send failed to ${input.to} via ${transport}: ${(error as Error)?.message}`,
      );
      throw error;
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      );
    });
    return Promise.race([promise, deadline]).then(
      (value) => {
        clearTimeout(timer);
        return value;
      },
      (error) => {
        clearTimeout(timer);
        throw error;
      },
    );
  }

  private async sendViaSmtp(
    input: SendMailInput,
    html: string,
  ): Promise<string | undefined> {
    const info = await this.getSmtpTransporter().sendMail({
      from: `"${this.fromName()}" <${this.fromEmail()}>`,
      to: input.to,
      subject: input.subject,
      html,
    });
    return info?.messageId;
  }

  private async sendViaBrevo(
    input: SendMailInput,
    html: string,
  ): Promise<string | undefined> {
    const response =
      await this.getBrevoClient().transactionalEmails.sendTransacEmail(
        {
          sender: { email: this.fromEmail(), name: this.fromName() },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: html,
        },
        { timeoutInSeconds: Math.ceil(SEND_TIMEOUT_MS / 1000) },
      );
    return (response as { messageId?: string } | undefined)?.messageId;
  }

  private getSmtpTransporter(): Transporter {
    if (!this.smtpTransporter) {
      const port = Number(this.configService.get<string>('SMTP_PORT', '587'));
      this.smtpTransporter = nodemailer.createTransport({
        host: this.configService.get<string>(
          'SMTP_HOST',
          'smtp-relay.brevo.com',
        ),
        port,
        secure: port === 465,
        auth: {
          user: this.configService.get<string>('SMTP_USER', ''),
          pass: this.configService.get<string>('SMTP_PASS', ''),
        },
        connectionTimeout: SEND_TIMEOUT_MS,
        greetingTimeout: SEND_TIMEOUT_MS,
        socketTimeout: SEND_TIMEOUT_MS + 2000,
      });
    }
    return this.smtpTransporter;
  }

  private getBrevoClient(): BrevoClient {
    if (!this.brevoClient) {
      this.brevoClient = new BrevoClient({
        apiKey: this.configService.get<string>('BREVO_API_KEY', ''),
      });
    }
    return this.brevoClient;
  }

  private fromEmail(): string {
    return this.configService.get<string>(
      'MAIL_FROM_EMAIL',
      'no-reply@propora.io',
    );
  }

  private fromName(): string {
    return this.configService.get<string>('MAIL_FROM_NAME', 'Propora');
  }

  private templatesDir(): string {
    const candidates = [
      resolve(process.cwd(), 'src/mail/templates'),
      resolve(process.cwd(), 'dist/src/mail/templates'),
      resolve(process.cwd(), 'dist/mail/templates'),
    ];
    const found = candidates.find((dir) =>
      existsSync(join(dir, 'welcome.pug')),
    );
    if (!found) {
      throw new Error(
        `Mail templates directory not found (tried: ${candidates.join(', ')})`,
      );
    }
    return found;
  }
}
