import { expect, test } from "@playwright/test"

test.describe("Logout", () => {
  test("user can logout and is redirected to login", async ({ page }) => {
    await page.goto("/home")
    const logoutButton = page.locator(".logout-button")
    await expect(logoutButton).toBeVisible()
    await logoutButton.click()

    await expect(page).toHaveURL(/\/login/)

    await page.goto("/models")
    await expect(page).toHaveURL(/\/login/)
  })
})
