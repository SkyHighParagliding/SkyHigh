// Pagination utility for list endpoints
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export function getPaginationParams(query: Record<string, any>): PaginationParams {
  let limit = parseInt(query.limit as string, 10) || DEFAULT_LIMIT;
  let offset = parseInt(query.offset as string, 10) || 0;

  // Validate and clamp values
  limit = Math.max(1, Math.min(limit, MAX_LIMIT));
  offset = Math.max(0, offset);

  return { limit, offset };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number
): PaginatedResponse<T> {
  return {
    data,
    total,
    limit,
    offset,
    hasMore: offset + data.length < total,
  };
}
