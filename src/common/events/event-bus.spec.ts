import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('delivers events to subscribed handlers', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('payment.paid', handler);

    await bus.emit('payment.paid', {
      organizationId: 'org-1',
      paymentId: 'pay-1',
      leaseId: 'lease-1',
      amount: 150,
      currency: 'USD',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1' }),
    );
  });

  it('isolates a failing handler so others still run', async () => {
    const bus = new EventBus();
    const good = vi.fn();
    bus.on('user.registered', () => {
      throw new Error('listener exploded');
    });
    bus.on('user.registered', good);

    await bus.emit('user.registered', {
      organizationId: 'org-1',
      organizationName: 'Org',
      userId: 'user-1',
      email: 'a@b.c',
      firstName: 'A',
    });

    expect(good).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes with the returned function', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on('user.invited', handler);
    off();

    await bus.emit('user.invited', {
      organizationId: 'org-1',
      organizationName: 'Org',
      email: 'a@b.c',
      firstName: 'A',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('emitting with no subscribers is a no-op', async () => {
    const bus = new EventBus();
    await expect(
      bus.emit('payment.paid', {
        organizationId: 'org-1',
        paymentId: 'pay-1',
        leaseId: 'lease-1',
        amount: 1,
        currency: 'USD',
      }),
    ).resolves.toBeUndefined();
  });
});
