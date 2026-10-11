export interface CorsSettings {
  origin: string | (string | RegExp)[];
  credentials: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turns one CORS_ORIGIN entry into a literal origin or a RegExp.
 * `https://*.vercel.app` matches any preview/production deployment under
 * that domain (handy because Vercel preview URLs change per branch).
 * Prefer exact origins in production — a wildcard trusts every subdomain.
 */
function toOriginPattern(entry: string): string | RegExp {
  if (!entry.includes('*')) {
    return entry;
  }
  const pattern = `^${entry.split('*').map(escapeRegExp).join('.*')}$`;
  return new RegExp(pattern);
}

/**
 * Parses CORS_ORIGIN (comma-separated, `*` = public API).
 *
 * Browsers reject `Access-Control-Allow-Origin: *` when credentials are
 * included, so a wildcard origin automatically disables credentials.
 * Cross-origin dashboards that rely on httpOnly cookies must set explicit
 * origin(s) (and usually COOKIE_SAMESITE=none).
 */
export function parseCorsSettings(
  raw: string | undefined,
  nodeEnv: string,
): CorsSettings {
  const list = (raw ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (list.length === 0 || list.includes('*')) {
    if (nodeEnv === 'production') {
      // Fail-open would silently break cookie auth in prod; warn loudly.
      // eslint-disable-next-line no-console
      console.warn(
        '[cors] CORS_ORIGIN is "*" in production: cookies/credentials are disabled. ' +
          'Set CORS_ORIGIN to your dashboard origin (and COOKIE_SAMESITE=none) to use cookie auth cross-origin.',
      );
    }
    return { origin: '*', credentials: false };
  }

  return { origin: list.map(toOriginPattern), credentials: true };
}
