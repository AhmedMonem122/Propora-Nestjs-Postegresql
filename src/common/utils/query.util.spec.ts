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
    [0, false],
  ])('coerces %j to %j', (value, expected) => {
    expect(toBoolean({ value })).toBe(expected);
  });

  it.each([undefined, null])('leaves %j absent', (value) => {
    expect(toBoolean({ value })).toBeUndefined();
  });
});
