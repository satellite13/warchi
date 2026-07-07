import { apiPost } from "@/composables/useApi"
import type {
  PermissionAction,
  PermissionCheckRequest,
  PermissionCheckResponse,
  PermissionResourceType,
} from "@/types/api"

type CheckPermissionInput = {
  resourceType: PermissionResourceType
  resourceId: string
  action: PermissionAction
}

type CheckPermissionsInput = {
  resourceType: PermissionResourceType
  resourceId: string
  actions: PermissionAction[]
}

const buildRequest = (input: CheckPermissionsInput): PermissionCheckRequest => ({
  resourceType: input.resourceType,
  resourceId: input.resourceId,
  actions: input.actions.length > 0 ? input.actions : ["VIEW"],
})

export async function canViewAdminPanel(userId: string): Promise<boolean> {
  const result = await apiPost<PermissionCheckResponse>("/permissions/check", {
    resourceType: "ADMIN_PANEL",
    resourceId: userId,
    actions: ["VIEW"],
  })
  if (!result.success) {
    return false
  }
  return result.data.decisions?.VIEW === true
}

export function usePermissions() {
  const checkPermissions = async (input: CheckPermissionsInput): Promise<Record<string, boolean>> => {
    const result = await apiPost<PermissionCheckResponse>("/permissions/check", buildRequest(input))
    if (!result.success) {
      return {}
    }
    return result.data.decisions ?? {}
  }

  const checkPermission = async (input: CheckPermissionInput): Promise<boolean> => {
    const decisions = await checkPermissions({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      actions: [input.action],
    })
    return decisions[input.action] === true
  }

  return {
    checkPermission,
    checkPermissions,
  }
}
