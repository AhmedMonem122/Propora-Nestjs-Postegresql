import { describe, expect, it } from 'vitest';
import { toBoolean } from './query.util.js';

describe('toBoolean', () => {
  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    ['1', false],
    ['', false],
    [undefined, false],
    [null, false],
    [0, false],
  ])('coerces %j to %j', (value, expected) => {
    expect(toBoolean({ value })).toBe(expected);
  });
});
