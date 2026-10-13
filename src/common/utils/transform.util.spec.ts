import { describe, expect, it } from 'vitest';
import { emptyToUndefined } from './transform.util.js';

describe('emptyToUndefined', () => {
  it('turns empty strings into undefined', () => {
    expect(emptyToUndefined({ value: '' })).toBeUndefined();
  });

  it('leaves real values untouched', () => {
    expect(emptyToUndefined({ value: 0 })).toBe(0);
    expect(emptyToUndefined({ value: 350 })).toBe(350);
    expect(emptyToUndefined({ value: 'x' })).toBe('x');
    expect(emptyToUndefined({ value: undefined })).toBeUndefined();
    expect(emptyToUndefined({ value: null })).toBeNull();
  });
});
