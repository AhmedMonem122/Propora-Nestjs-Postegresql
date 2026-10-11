import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseCorsSettings } from './cors.util.js';

describe('parseCorsSettings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to a credential-less wildcard', () => {
    expect(parseCorsSettings(undefined, 'development')).toEqual({
      origin: '*',
      credentials: false,
    });
  });

  it('returns exact origins with credentials', () => {
    expect(
      parseCorsSettings(
        'https://app.example.com, http://localhost:3000',
        'development',
      ),
    ).toEqual({
      origin: ['https://app.example.com', 'http://localhost:3000'],
      credentials: true,
    });
  });

  it('compiles subdomain wildcards to RegExp', () => {
    const settings = parseCorsSettings('https://*.vercel.app', 'production');
    expect(settings.credentials).toBe(true);
    const [pattern] = settings.origin as RegExp[];
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern.test('https://propora-web-git-main.vercel.app')).toBe(true);
    expect(pattern.test('https://evil.com')).toBe(false);
    expect(pattern.test('https://vercel.app.evil.com')).toBe(false);
  });

  it('warns about wildcard in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    parseCorsSettings('*', 'production');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
