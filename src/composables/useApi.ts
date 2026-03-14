// Re-export all API functions from the pure api client module.
// This file exists for backward compatibility — all consumers can
// continue to import from "@/composables/useApi".
export {
  apiFetch,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  uploadDiagramSvg,
  createDiagramShareLink,
} from "../api/apiClient"

export type {
  ApiError,
  ApiResult,
  DiagramShareLinkPayload,
  DiagramShareLinkResponse,
} from "../api/apiClient"
