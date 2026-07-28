import { describe, it, expect, vi, beforeEach } from "vitest"

const mockApiPost = vi.fn()

vi.mock("@/composables/useApi", () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}))

import { canViewAdminPanel, usePermissions } from "./usePermissions"

describe("usePermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("checkPermission returns true when backend allows action", async () => {
    mockApiPost.mockResolvedValue({
      success: true,
      data: {
        resourceType: "MODEL",
        resourceId: "m1",
        decisions: { EDIT: true },
      },
    })

    const { checkPermission } = usePermissions()
    const allowed = await checkPermission({
      resourceType: "MODEL",
      resourceId: "m1",
      action: "EDIT",
    })

    expect(allowed).toBe(true)
    expect(mockApiPost).toHaveBeenCalledWith("/permissions/check", {
      resourceType: "MODEL",
      resourceId: "m1",
      actions: ["EDIT"],
    })
  })

  it("checkPermissions returns empty map on api error", async () => {
    mockApiPost.mockResolvedValue({
      success: false,
      error: { status: 403, message: "denied" },
    })

    const { checkPermissions } = usePermissions()
    const decisions = await checkPermissions({
      resourceType: "NOTATION",
      resourceId: "n1",
      actions: ["VIEW", "EDIT"],
    })

    expect(decisions).toEqual({})
  })

  it("canViewAdminPanel checks ADMIN_PANEL VIEW for the current user id", async () => {
    mockApiPost.mockResolvedValue({
      success: true,
      data: {
        resourceType: "ADMIN_PANEL",
        resourceId: "u1",
        decisions: { VIEW: true },
      },
    })

    const allowed = await canViewAdminPanel("u1")

    expect(allowed).toBe(true)
    expect(mockApiPost).toHaveBeenCalledWith("/permissions/check", {
      resourceType: "ADMIN_PANEL",
      resourceId: "u1",
      actions: ["VIEW"],
    })
  })
})
