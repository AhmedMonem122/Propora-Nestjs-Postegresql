import { describe, expect, it } from 'vitest';
import { slugify } from './slugify.util.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Sunrise Properties LLC')).toBe('sunrise-properties-llc');
  });

  it('strips special characters', () => {
    expect(slugify('Nile Corniche — Phase 2!')).toBe(
      'nile-corniche-phase-2',
    );
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  -- Downtown --  ')).toBe('downtown');
  });

  it('falls back to a default slug for empty input', () => {
    expect(slugify('   ')).toBe('organization');
    expect(slugify('!!!')).toBe('organization');
  });
});
