import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  MemoryRateLimitStore,
  getSharedStore,
  setSharedStore,
} from './rate-limit.store.js';

describe('MemoryRateLimitStore', () => {
  it('counts hits inside the window', async () => {
    const store = new MemoryRateLimitStore();
    const first = await store.hit('ip:1', 60_000);
    const second = await store.hit('ip:1', 60_000);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(second.resetAt).toBe(first.resetAt);
  });

  it('keeps keys independent (auth vs api buckets)', async () => {
    const store = new MemoryRateLimitStore();
    await store.hit('auth:1.2.3.4', 60_000);
    const api = await store.hit('api:1.2.3.4', 60_000);

    expect(api.count).toBe(1);
  });

  it('resets after the window passes', async () => {
    const store = new MemoryRateLimitStore();
    vi.useFakeTimers();
    try {
      await store.hit('k', 1000);
      vi.advanceTimersByTime(1001);
      const again = await store.hit('k', 1000);
      expect(again.count).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getSharedStore', () => {
  afterEach(() => {
    setSharedStore(null);
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('defaults to memory without Upstash env', () => {
    expect(getSharedStore()).toBeInstanceOf(MemoryRateLimitStore);
  });
});
