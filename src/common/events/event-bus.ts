import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventMap, DomainEventName } from './domain-events.js';

export type DomainEventHandler<T> = (payload: T) => unknown;

/**
 * Minimal typed in-process event bus (Observer pattern).
 *
 * Domain services emit facts (`payment.paid`, …) and cross-cutting
 * listeners (notifications, email, webhooks, audit) react to them.
 * Delivery is best-effort and never fails the originating request:
 * every handler runs isolated via `Promise.allSettled` plus a
 * try/catch, so one broken listener cannot break the others.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<string, Set<DomainEventHandler<never>>>();

  on<K extends DomainEventName>(
    event: K,
    handler: DomainEventHandler<DomainEventMap[K]>,
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as DomainEventHandler<never>);
    return () => {
      set.delete(handler as DomainEventHandler<never>);
    };
  }

  async emit<K extends DomainEventName>(
    event: K,
    payload: DomainEventMap[K],
  ): Promise<void> {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) {
      return;
    }

    await Promise.allSettled(
      [...set].map(async (handler) => {
        try {
          await (handler as DomainEventHandler<unknown>)(payload);
        } catch (error) {
          this.logger.error(
            `Event handler failed for "${event}": ${(error as Error)?.message}`,
            (error as Error)?.stack,
          );
        }
      }),
    );
  }
}
