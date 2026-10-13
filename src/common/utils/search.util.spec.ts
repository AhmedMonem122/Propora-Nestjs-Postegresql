import { describe, expect, it } from 'vitest';
import { splitSearchTerms } from './search.util.js';

describe('splitSearchTerms', () => {
  it('splits on whitespace', () => {
    expect(splitSearchTerms('QA Resident')).toEqual(['QA', 'Resident']);
  });

  it('returns [] for empty input', () => {
    expect(splitSearchTerms(undefined)).toEqual([]);
    expect(splitSearchTerms('')).toEqual([]);
    expect(splitSearchTerms('   ')).toEqual([]);
  });
});
