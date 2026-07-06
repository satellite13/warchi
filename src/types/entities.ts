export interface VersionedEntity {
  id: string;
  name: string;
  version: string;
  ownerId: string;
  accessPermission?: AccessPermission | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ModelData extends VersionedEntity {
  attrs?: string | null;
  /** Id модели-источника, из которой создана эта версия (дерево версий). */
  sourceId?: string | null;
}

export interface NotationData extends VersionedEntity {
  attrs?: string | null;
  /** Id нотации-источника, из которой создана эта версия (дерево версий). */
  sourceId?: string | null;
}

export interface EntityGroup<T extends VersionedEntity> {
  name: string;
  versions: T[];
}

export interface UserInfo {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  position?: string | null;
}

/** Метаданные страницы в ответах Spring Data 3.3+ при сериализации Page через PagedModel. */
export interface SpringPagedModelPage {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  content?: T[];
  /** arepos ListResponse (`/models`, `/users`, `/diagram-locks`, …) */
  items?: T[];
  /** Spring Data VIA_DTO: поля пагинации внутри `page`. */
  page?: SpringPagedModelPage;
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
  first?: boolean;
  last?: boolean;
  numberOfElements?: number;
  empty?: boolean;
  sort?: object | null;
}

export interface User {
  id: string;
  email: string;
  role?: UserRole;
  isActive?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  position?: string | null;
  attrs?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type UserRole = "USER" | "ADMIN";

export interface UserProfileForm {
  firstName: string;
  lastName: string;
  middleName?: string;
  position?: string;
}

export type AccessPermission = "OWNER" | "EDIT" | "VIEW" | "ADMIN";
