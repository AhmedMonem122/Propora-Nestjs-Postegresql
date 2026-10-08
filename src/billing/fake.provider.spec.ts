import { describe, expect, it } from 'vitest';
import { FakeProvider } from './fake.provider.js';

describe('FakeProvider', () => {
  it('builds a stateless confirm URL embedding the payment id', async () => {
    const provider = new FakeProvider({
      get: (key: string, fallback?: string) =>
        key === 'APP_PUBLIC_URL' ? 'https://api.example.com' : fallback,
    } as never);

    const session = await provider.createCheckout({
      paymentId: 'pay_123',
      amount: 99.5,
      currency: 'USD',
      description: 'Rent',
      successUrl: 'https://app.example.com/ok',
      cancelUrl: 'https://app.example.com/cancel',
    });

    expect(session.provider).toBe('FAKE');
    expect(session.providerRef).toMatch(/^fake_pay_123_[0-9a-f]+$/);
    expect(session.checkoutUrl).toBe(
      `https://api.example.com/api/v1/billing/fake/${session.providerRef}/confirm`,
    );
  });

  it('is always configured (offline friendly)', () => {
    const provider = new FakeProvider({ get: () => undefined } as never);
    expect(provider.isConfigured()).toBe(true);
  });
});
