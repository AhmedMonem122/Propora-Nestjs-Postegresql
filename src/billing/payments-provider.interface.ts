export const PAYMENTS_PROVIDER = 'PAYMENTS_PROVIDER';

export type PaymentProviderName = 'STRIPE' | 'FAKE' | 'MANUAL';

export interface CheckoutInput {
  paymentId: string;
  /** Major units, e.g. `150.00` — converted to cents internally. */
  amount: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export interface CheckoutSession {
  providerRef: string;
  checkoutUrl: string;
  provider: PaymentProviderName;
}

/**
 * Strategy interface for online payment providers.
 * Add a new gateway by implementing this interface and registering it in
 * the PAYMENTS_PROVIDER factory — no other code changes needed.
 */
export interface PaymentsProvider {
  readonly name: PaymentProviderName;
  isConfigured(): boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
}
