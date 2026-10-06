import { describe, expect, it } from 'vitest';
import {
  buildPaginationMeta,
  normalizePagination,
} from './pagination.util.js';

describe('normalizePagination', () => {
  it('applies defaults when no params are provided', () => {
    expect(normalizePagination({})).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
  });

  it('normalizes invalid values to safe defaults', () => {
    expect(normalizePagination({ page: -5, limit: 1000 })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
      take: 100,
    });
  });

  it('computes skip from page and limit', () => {
    expect(normalizePagination({ page: 3, limit: 10 })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
      take: 10,
    });
  });
});

describe('buildPaginationMeta', () => {
  it('computes totalPages and navigation flags', () => {
    const meta = buildPaginationMeta(45, 2, 20);

    expect(meta).toEqual({
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('handles empty result sets', () => {
    const meta = buildPaginationMeta(0, 1, 20);

    expect(meta.totalPages).toBe(0);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(false);
  });
});
