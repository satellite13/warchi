import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiDelete = vi.fn();
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock("./useApi", () => ({
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args)
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

import { useAccessShares } from "./useAccessShares";

describe("useAccessShares", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads public shares from arepos ListResponse items", async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === "/access/shares/NOTATION/notation-1") {
        return Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: "share-1",
                resourceType: "NOTATION",
                resourceId: "notation-1",
                granteeUserId: null,
                grantedByUserId: "owner-1",
                permission: "VIEW",
                createdAt: null,
                updatedAt: null
              }
            ],
            total: 1,
            page: 0,
            size: 1
          }
        });
      }

      if (url === "/users/owner-1/public") {
        return Promise.resolve({
          success: true,
          data: {
            id: "owner-1",
            email: "owner@example.com",
            firstName: null,
            lastName: null,
            middleName: null
          }
        });
      }

      return Promise.resolve({ success: false, error: { status: 404, message: "Not found" } });
    });

    const { loadShares, shares } = useAccessShares();

    await loadShares("NOTATION", "notation-1");

    expect(shares.value).toHaveLength(1);
    expect(shares.value[0]).toMatchObject({
      id: "share-1",
      granteeUserId: null,
      granteeDisplayName: "share.allUsers",
      grantedByDisplayName: "owner@example.com",
      permissionLabel: "share.viewOnly"
    });
  });
});
