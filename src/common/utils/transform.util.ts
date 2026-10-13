/**
 * Turns empty-string form values into `undefined` for `@Transform()`.
 *
 * HTML number inputs submit `""` when cleared; without this, optional
 * numeric DTO fields reject the request (`"" must be a number`) even
 * though "no value" is perfectly valid. Required fields are unaffected:
 * `undefined` still fails their validators with a clear message.
 */
export function emptyToUndefined({ value }: { value: unknown }): unknown {
  return value === '' ? undefined : value;
}
