import { describe, expect, it } from 'vitest';
import { SupabaseService } from './supabase.service.js';

function createService(env: Record<string, string>) {
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  };
  return new SupabaseService(config as never);
}

describe('SupabaseService configuration', () => {
  it('is unconfigured without url or keys', () => {
    expect(createService({}).isConfigured()).toBe(false);
    expect(
      createService({ SUPABASE_URL: 'https://x.supabase.co' }).isConfigured(),
    ).toBe(false);
  });

  it('works with the anon key alone (RLS policies required)', () => {
    const service = createService({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    });
    expect(service.isConfigured()).toBe(true);
    expect(service.usesServiceKey()).toBe(false);
  });

  it('prefers the service key when both are set', () => {
    const service = createService({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_KEY: 'service-role',
    });
    expect(service.isConfigured()).toBe(true);
    expect(service.usesServiceKey()).toBe(true);
  });
});
