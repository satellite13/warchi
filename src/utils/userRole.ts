import type { User, UserRole } from "../types/entities";

export const normalizeUserRole = (role?: string | null): UserRole =>
  role === "ADMIN" ? "ADMIN" : "USER";

export const normalizeUser = (user: User): User => ({
  ...user,
  role: normalizeUserRole(user.role)
});
