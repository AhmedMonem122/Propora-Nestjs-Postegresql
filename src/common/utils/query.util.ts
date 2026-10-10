/**
 * Coerces query-string flags to real booleans for `@Transform()`.
 * Only `true`/`'true'` become true — everything else (including `'false'`
 * and missing values) is false, so `?unreadOnly=false` behaves correctly.
 *
 * IMPORTANT: pair it with `@Type(() => String)`. With
 * `enableImplicitConversion` (global), class-transformer coerces query
 * strings via `Boolean(value)` BEFORE custom transforms run — and
 * `Boolean('false')` is `true`, silently inverting every `=false` filter.
 * An explicit `@Type(() => String)` pins the value so this function sees
 * the raw string. `undefined`/`null` pass through untouched so optional
 * filters stay absent when not provided.
 */
export function toBoolean({
  value,
}: {
  value: unknown;
}): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value === true || value === 'true';
}
