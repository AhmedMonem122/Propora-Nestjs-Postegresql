import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service.js';

function createService(
  env: Record<string, string>,
  fakeClient?: unknown,
) {
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  };
  const service = new (class extends SupabaseService {
    override createRawClient() {
      return fakeClient as never;
    }
  })(config as never);
  return service;
}

function storageMock(overrides: Record<string, unknown> = {}) {
  return {
    storage: {
      listBuckets: vi.fn().mockResolvedValue({ data: [], error: null }),
      createBucket: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: 'https://x.supabase.co/storage/documents/f' },
        })),
      })),
      ...overrides,
    },
  };
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

  it('ensureBucket returns false (not throw) when RLS blinds listing', async () => {
    const service = createService(
      {
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
      },
      storageMock({
        listBuckets: vi
          .fn()
          .mockResolvedValue({ data: [], error: null }),
        createBucket: vi.fn().mockResolvedValue({
          error: { message: 'new row violates row-level security policy' },
        }),
      }),
    );

    await expect(service.ensureBucket()).resolves.toBe(false);
  });

  it('upload maps RLS errors to an actionable message', async () => {
    const service = createService(
      {
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_ANON_KEY: 'anon',
      },
      storageMock({
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({
            error: { message: 'new row violates row-level security policy' },
          }),
        })),
      }),
    );

    await expect(
      service.upload('a/b.pdf', Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow(/SUPABASE_SERVICE_KEY/);
  });
});
