import { buildApiUrl } from "../api/config";

export type ApiError = {
  status: number;
  message: string;
};

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

const createApiError = (status: number, message: string): ApiError => ({
  status,
  message
});

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const url = buildApiUrl(path);
  const headers: HeadersInit = {
    Accept: "application/json",
    ...options.headers
  } as Record<string, string>;

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      return {
        success: false,
        error: createApiError(response.status, `Ошибка (${response.status})`)
      };
    }

    // 204 No Content и пустое тело — не парсим JSON (контракт API)
    const text = await response.text();
    const data = (text.length > 0 ? JSON.parse(text) : undefined) as T;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: createApiError(
        0,
        error instanceof Error ? error.message : "Ошибка подключения"
      )
    };
  }
}

export const apiGet = <T>(path: string): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { method: "GET" });

export const apiPost = <T>(path: string, body: unknown): Promise<ApiResult<T>> =>
  apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });

export const apiPut = <T>(path: string, body: unknown): Promise<ApiResult<T>> =>
  apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body)
  });

export const apiDelete = <T>(path: string): Promise<ApiResult<T>> =>
  apiFetch<T>(path, { method: "DELETE" });
