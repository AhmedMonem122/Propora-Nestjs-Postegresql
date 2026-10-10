/**
 * Coerces query-string flags to real booleans for `@Transform()`.
 * Only `true`/`'true'` become true — everything else (including `'false'`
 * and missing values) is false, so `?unreadOnly=false` behaves correctly.
 */
export function toBoolean({ value }: { value: unknown }): boolean {
  return value === true || value === 'true';
}
