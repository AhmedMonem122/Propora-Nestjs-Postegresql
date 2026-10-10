import { describe, expect, it } from 'vitest';
import { MailService } from './mail.service.js';

function createService(env: Record<string, string> = {}) {
  const config = {
    get: (key: string, fallback?: string) => {
      const values: Record<string, string> = {
        MAIL_FROM_EMAIL: 'no-reply@propora.io',
        MAIL_FROM_NAME: 'Propora',
        ...env,
      };
      return values[key] ?? fallback;
    },
  };
  return new MailService(config as never);
}

describe('MailService', () => {
  it('prefers SMTP when credentials are set', () => {
    const service = createService({
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      BREVO_API_KEY: 'xkeysib-123',
    });
    expect(service.activeTransport()).toBe('smtp');
    expect(service.isConfigured()).toBe(true);
  });

  it('falls back to the Brevo API when only the API key is set', () => {
    const service = createService({ BREVO_API_KEY: 'xkeysib-123' });
    expect(service.activeTransport()).toBe('brevo');
  });

  it('honours a forced transport', () => {
    const service = createService({
      MAIL_TRANSPORT: 'brevo',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      BREVO_API_KEY: 'xkeysib-123',
    });
    expect(service.activeTransport()).toBe('brevo');
  });

  it('reports unconfigured when nothing is set', () => {
    const service = createService();
    expect(service.activeTransport()).toBe('none');
    expect(service.isConfigured()).toBe(false);
  });
  it('renders the welcome template with context values', () => {
    const service = createService();
    const html = service.render('welcome', {
      firstName: 'Ahmed',
      email: 'ahmed@example.com',
      organizationName: 'Sunrise LLC',
    });

    expect(html).toContain('Ahmed');
    expect(html).toContain('Sunrise LLC');
    expect(html).toContain('ahmed@example.com');
  });

  it('skips sending (with a warning, not an error) when Brevo is unconfigured', async () => {
    const service = createService();
    const result = await service.send({
      to: 'ahmed@example.com',
      subject: 'Hello',
      template: 'welcome',
      context: {
        firstName: 'Ahmed',
        email: 'ahmed@example.com',
        organizationName: 'Sunrise LLC',
      },
    });

    expect(result.skipped).toBe(true);
  });
});
