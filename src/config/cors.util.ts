export interface CorsSettings {
  origin: string | (string | RegExp)[];
  credentials: boolean;
}

/**
 * Parses CORS_ORIGIN (comma-separated, `*` = public API).
 *
 * Browsers reject `Access-Control-Allow-Origin: *` when credentials are
 * included, so a wildcard origin automatically disables credentials.
 * Cross-origin dashboards that rely on httpOnly cookies must set an
 * explicit origin (and usually COOKIE_SAMESITE=none).
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

  return { origin: list, credentials: true };
}
