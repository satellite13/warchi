export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
export const API_VERSION = import.meta.env.VITE_API_VERSION || "v1";

export const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}/api/${API_VERSION}${normalizedPath}`;
};
