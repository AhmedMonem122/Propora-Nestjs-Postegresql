import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BrevoClient } from '@getbrevo/brevo';
import pug from 'pug';

export type MailTemplate =
  | 'welcome'
  | 'invite'
  | 'receipt'
  | 'maintenance-assigned'
  | 'password-changed'
  | 'otp';

export interface SendMailInput {
  to: string;
  subject: string;
  template: MailTemplate;
  context: Record<string, unknown>;
}

/**
 * Transactional email via Brevo with Pug templates.
 *
 * - Templates are plain `.pug` files (no layout inheritance) so they resolve
 *   identically in dev, tests, `dist` builds and the Vercel bundle.
 * - When `BREVO_API_KEY` is missing the send is skipped with a warning
 *   instead of failing — local development and CI stay usable without keys.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly compiled = new Map<string, pug.compileTemplate>();
  private client: BrevoClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('BREVO_API_KEY'));
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

    if (!this.isConfigured()) {
      this.logger.warn(
        `Mail skipped (BREVO_API_KEY not set): to=${input.to} subject="${input.subject}"`,
      );
      return { skipped: true };
    }

    try {
      const response = await this.getClient().transactionalEmails.sendTransacEmail(
        {
          sender: { email: this.fromEmail(), name: this.fromName() },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: html,
        },
      );
      const messageId = (response as { messageId?: string } | undefined)
        ?.messageId;
      this.logger.log(`Mail sent to ${input.to} ("${input.subject}")`);
      return { skipped: false, messageId };
    } catch (error) {
      this.logger.error(
        `Mail send failed to ${input.to}: ${(error as Error)?.message}`,
      );
      throw error;
    }
  }

  private getClient(): BrevoClient {
    if (!this.client) {
      this.client = new BrevoClient({
        apiKey: this.configService.get<string>('BREVO_API_KEY', ''),
      });
    }
    return this.client;
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
