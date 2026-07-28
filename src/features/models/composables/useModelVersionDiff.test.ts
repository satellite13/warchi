import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ModelVersionDiffModal from "../components/ModelVersionDiffModal.vue"
import { useModelVersionDiff } from "./useModelVersionDiff"

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}))

vi.mock("@/composables/useApi", () => ({
  apiGet: mockApiGet,
}))

vi.mock("vue-i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue-i18n")>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

/** Форма ответа arepos ListResponse для GET /models/{id}/related-versions. */
function listResponseItems(items: Array<{ id: string; name: string; version: string }>) {
  return { items, total: items.length, page: 0, size: items.length }
}

function mountCompareModal(relatedVersions: unknown) {
  return mount(ModelVersionDiffModal, {
    props: {
      modelId: "m1",
      modelVersion: "1.0.0",
      relatedVersions: relatedVersions as never,
      relatedVersionsLoading: false,
      compareTargetId: null,
      compareTargetLoading: false,
      compareTargetError: null,
      diff: null,
    },
    global: {
      stubs: {
        BaseModal: {
          template: "<div><slot /></div>",
        },
      },
    },
  })
}

describe("regression: related-versions ListResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetchRelatedVersions unwraps ListResponse.items into an array", async () => {
    const items = [
      { id: "m1", name: "Model", version: "1.0.0" },
      { id: "m2", name: "Model", version: "1.1.0" },
    ]
    mockApiGet.mockResolvedValue({
      success: true,
      data: listResponseItems(items),
    })

    const { relatedVersions, fetchRelatedVersions } = useModelVersionDiff()
    await fetchRelatedVersions("m1")

    expect(mockApiGet).toHaveBeenCalledWith("/models/m1/related-versions")
    expect(Array.isArray(relatedVersions.value)).toBe(true)
    expect(relatedVersions.value).toEqual(items)
    // Точная ошибка прода: relatedVersions.filter is not a function
    expect(() => relatedVersions.value.filter((m) => m.id !== "m1")).not.toThrow()
  })

  it("ModelVersionDiffModal opens after ListResponse fetch without filter crash", async () => {
    const items = [
      { id: "m1", name: "Model", version: "1.0.0", ownerId: "u1" },
      { id: "m2", name: "Model", version: "1.1.0", ownerId: "u1" },
    ]
    mockApiGet.mockResolvedValue({
      success: true,
      data: listResponseItems(items),
    })

    const { relatedVersions, fetchRelatedVersions } = useModelVersionDiff()
    await fetchRelatedVersions("m1")

    expect(() => mountCompareModal(relatedVersions.value)).not.toThrow()
    const wrapper = mountCompareModal(relatedVersions.value)
    const options = wrapper.findAll("option")
    expect(options.some((o) => o.text().includes("1.1.0"))).toBe(true)
    expect(options.every((o) => !o.text().includes("1.0.0") || o.attributes("value") === "")).toBe(
      true
    )
  })

  it("ModelVersionDiffModal does not crash when relatedVersions is raw ListResponse object", () => {
    // Регрессия исходного бага: в props попадал весь ListResponse вместо items
    const rawListResponse = listResponseItems([
      { id: "m1", name: "Model", version: "1.0.0" },
      { id: "m2", name: "Model", version: "1.1.0" },
    ])

    expect(() => mountCompareModal(rawListResponse)).not.toThrow()
    const wrapper = mountCompareModal(rawListResponse)
    expect(wrapper.find(".mdm__msg--muted").exists()).toBe(true)
  })
})
