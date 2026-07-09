import { test, expect } from '@playwright/test'
import { currentUser, ensureUser, loginViaUi } from './helpers/e2eApi'
import {
  cleanupDiagramLockFixture,
  createSharedDiagramFixture,
  expectForeignLockPip,
  expectOwnLockPip,
  holdDiagramLockAcrossBlur,
  openDiagramByName,
  openModelEditor,
  type DiagramLockFixture,
} from './helpers/diagramLockFixture'

const COLLAB_EMAIL = process.env.E2E_COLLAB_EMAIL || 'e2e-collab@warchi.dev'
const COLLAB_PASSWORD = process.env.E2E_COLLAB_PASSWORD || 'e2eTest123!'

test.describe('Diagram edit lock / spectator', () => {
  test.describe.configure({ mode: 'serial' })

  test('second editor sees lock held by first editor', async ({ page, browser }) => {
    test.setTimeout(120000)

    const owner = await currentUser(page)

    // Seed/login collab in an isolated context so we never overwrite the owner session cookies.
    const seedContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      await ensureUser(seedContext.request, {
        email: COLLAB_EMAIL,
        password: COLLAB_PASSWORD,
        firstName: 'E2E',
        lastName: 'Collab',
      })
    } finally {
      await seedContext.close()
    }

    const collabContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const collabPage = await collabContext.newPage()
    let fixture: DiagramLockFixture | null = null

    try {
      await loginViaUi(collabPage, COLLAB_EMAIL, COLLAB_PASSWORD)
      const collab = await currentUser(collabPage)
      expect(collab.id).not.toBe(owner.id)

      fixture = await createSharedDiagramFixture(page, owner, collab.id)

      // Keep owner lock while Playwright focuses the collab page (product releases on hidden).
      await holdDiagramLockAcrossBlur(page)

      await openModelEditor(page, fixture.modelId)
      await openDiagramByName(page, fixture.diagramName)
      await expectOwnLockPip(page, fixture.diagramName)

      // Owner holds the lock — no "locked by other" chip for the holder.
      await expect(page.locator('.lock-chip')).toHaveCount(0)

      await openModelEditor(collabPage, fixture.modelId)
      await openDiagramByName(collabPage, fixture.diagramName)

      // Tree pip is the reliable signal; canvas lock-chip appears once blocked state settles.
      await expectForeignLockPip(collabPage, fixture.diagramName)
      const lockChip = collabPage.locator('.lock-chip')
      await expect(lockChip).toBeVisible({ timeout: 20000 })
      await expect(lockChip).toContainText(/E2E|User|Collab|e2e/i)

      // Soft check: if live collab WS is up, owner may see spectator avatars.
      const spectators = page.locator('.model-header__spectators')
      if (await spectators.isVisible().catch(() => false)) {
        await expect(spectators.locator('.model-header__spectator-avatar').first()).toBeVisible()
      }
    } finally {
      if (fixture) {
        await cleanupDiagramLockFixture(page, fixture)
      }
      await collabContext.close()
    }
  })
})
