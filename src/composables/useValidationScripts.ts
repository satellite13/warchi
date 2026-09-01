import { usePagedResourceCrud } from './usePagedResourceCrud'
import type {
  ValidationScriptResponse,
  ValidationScriptRequest,
  ValidationScriptUpdateRequest,
} from '../types/api'

const validationScriptsPath = '/validation-scripts'

export function useValidationScripts(options?: { beforeUpdate?: () => boolean }) {
  return usePagedResourceCrud<
    ValidationScriptResponse,
    ValidationScriptResponse,
    ValidationScriptRequest,
    ValidationScriptUpdateRequest
  >({
    basePath: validationScriptsPath,
    beforeUpdate: options?.beforeUpdate,
  })
}
