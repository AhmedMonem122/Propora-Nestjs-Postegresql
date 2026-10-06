export interface PaginationParams {
  page?: number;
  limit?: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface NormalizedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function normalizePagination(params: PaginationParams): NormalizedPagination {
  const page = Math.max(DEFAULT_PAGE, Math.floor(params.page ?? DEFAULT_PAGE));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(params.limit ?? DEFAULT_LIMIT)),
  );

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function paginated<T>(data: T[], meta: PaginationMeta) {
  return { data, meta };
}
