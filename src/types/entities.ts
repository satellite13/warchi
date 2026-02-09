export interface VersionedEntity {
  id: string;
  name: string;
  version: string;
  ownerId: string;
  updatedAt?: string | null;
}

export interface ModelData extends VersionedEntity {
  attrs?: string | null;
}

export interface NotationData extends VersionedEntity {
  attrs?: string | null;
}

export interface EntityGroup<T extends VersionedEntity> {
  name: string;
  versions: T[];
}

export interface UserInfo {
  id: string;
  email: string;
}

export interface PaginatedResponse<T> {
  content?: T[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
}

export interface User {
  id: string;
  email: string;
  attrs?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}
