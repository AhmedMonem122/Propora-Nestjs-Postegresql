/**
 * Storage abstraction for rate-limit counters (Strategy pattern).
 *
 * A single Node process can count in memory, but serverless functions run
 * on N concurrent instances that never share memory — per-instance
 * counters under-enforce limits. Point UPSTASH_REDIS_REST_URL/TOKEN at a
 * Redis database and every instance shares one counter via REST
 * (no persistent connection, serverless safe). Unset = memory fallback.
 */
export interface RateLimitHit {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, RateLimitHit>();

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    let record = this.hits.get(key);
    if (!record || now >= record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      this.hits.set(key, record);
    }
    record.count += 1;

    if (this.hits.size > 10_000) {
      for (const [storedKey, stored] of this.hits) {
        if (now >= stored.resetAt) {
          this.hits.delete(storedKey);
        }
      }
    }

    return { count: record.count, resetAt: record.resetAt };
  }
}

export class UpstashRateLimitStore implements RateLimitStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    try {
      const count = await this.call<number>(['INCR', key]);
      let ttl: number;
      if (count === 1) {
        await this.call<number>(['PEXPIRE', key, windowMs]);
        ttl = windowMs;
      } else {
        ttl = await this.call<number>(['PTTL', key]);
        if (!Number.isFinite(ttl) || ttl < 0) {
          ttl = windowMs;
        }
      }
      return { count, resetAt: now + ttl };
    } catch {
      // Fail open: a down rate-limit backend must not take the API down.
      return { count: 0, resetAt: now + windowMs };
    }
  }

  private async call<T>(command: (string | number)[]): Promise<T> {
    const response = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([command]),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      throw new Error(`Upstash error: ${response.status}`);
    }
    const rows = (await response.json()) as Array<{ result: T }>;
    return rows[0].result;
  }
}

let shared: RateLimitStore | null = null;

/** Process-wide store, env-selected once. Exported for tests. */
export function getSharedStore(): RateLimitStore {
  if (!shared) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    shared =
      url && token
        ? new UpstashRateLimitStore(url, token)
        : new MemoryRateLimitStore();
  }
  return shared;
}

/** Test-only hook to replace the shared store. */
export function setSharedStore(store: RateLimitStore | null): void {
  shared = store;
}
