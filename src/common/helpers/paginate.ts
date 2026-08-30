export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/** Clamp and convert page/limit to Prisma skip/take */
export function paginateParams(page: number, limit: number) {
  const p = Math.max(1, Math.floor(page));
  const l = Math.min(100, Math.max(1, Math.floor(limit)));
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

/** Wrap a data array + total count into a standard paginated envelope */
export function paginated<T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
