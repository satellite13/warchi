import type { PaginatedResponse } from "@/types/entities";

/** Элементы списка: массив как есть, Spring `content` или arepos `items`. */
export function paginatedContent<T>(data: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.content)) {
    return data.content;
  }
  if (Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

type PageMetaSource = Pick<
  PaginatedResponse<unknown>,
  "page" | "totalPages" | "totalElements" | "last"
>;

/** Читает totalPages из PagedModel (`page`) или из плоского ответа PageImpl (совместимость). */
export function paginatedTotalPages(data: PageMetaSource): number {
  return data.page?.totalPages ?? data.totalPages ?? 1;
}

export function paginatedTotalElements(data: PageMetaSource): number {
  return data.page?.totalElements ?? data.totalElements ?? 0;
}

/** Окончание обхода страниц: флаг `last` или сравнение индекса с totalPages. */
export function paginatedIsLastPage(data: PageMetaSource, pageIndex: number): boolean {
  if (data.last === true) {
    return true;
  }
  return pageIndex + 1 >= paginatedTotalPages(data);
}
