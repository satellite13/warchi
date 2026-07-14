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

// Dedicated users: the shared auth.setup user can be logged out by parallel logout.spec.
const OWNER_EMAIL = process.env.E2E_LOCK_OWNER_EMAIL || 'e2e-lock-owner@warchi.dev'
const OWNER_PASSWORD = process.env.E2E_LOCK_OWNER_PASSWORD || 'e2eTest123!'
const COLLAB_EMAIL = process.env.E2E_COLLAB_EMAIL || 'e2e-collab@warchi.dev'
const COLLAB_PASSWORD = process.env.E2E_COLLAB_PASSWORD || 'e2eTest123!'

// Do not reuse the shared authenticated storageState from auth.setup.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Diagram edit lock / spectator', () => {
  test.describe.configure({ mode: 'serial' })

  test('second editor sees lock held by first editor', async ({ browser }) => {
    test.setTimeout(120000)

    const seedContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      await ensureUser(seedContext.request, {
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        firstName: 'E2E',
        lastName: 'LockOwner',
      })
      await ensureUser(seedContext.request, {
        email: COLLAB_EMAIL,
        password: COLLAB_PASSWORD,
        firstName: 'E2E',
        lastName: 'Collab',
      })
    } finally {
      await seedContext.close()
    }

    const ownerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const collabContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const ownerPage = await ownerContext.newPage()
    const collabPage = await collabContext.newPage()
    let fixture: DiagramLockFixture | null = null

    try {
      await loginViaUi(ownerPage, OWNER_EMAIL, OWNER_PASSWORD)
      await loginViaUi(collabPage, COLLAB_EMAIL, COLLAB_PASSWORD)

      const owner = await currentUser(ownerPage)
      const collab = await currentUser(collabPage)
      expect(collab.id).not.toBe(owner.id)

      fixture = await createSharedDiagramFixture(ownerPage, owner, collab.id)

      // Keep owner lock while Playwright focuses the collab page (product releases on hidden).
      await holdDiagramLockAcrossBlur(ownerPage)

      await openModelEditor(ownerPage, fixture.modelId)
      await openDiagramByName(ownerPage, fixture.diagramName)
      await expectOwnLockPip(ownerPage, fixture.diagramName)

      // Owner holds the lock — no "locked by other" chip for the holder.
      await expect(ownerPage.locator('.lock-chip')).toHaveCount(0)

      await openModelEditor(collabPage, fixture.modelId)
      await openDiagramByName(collabPage, fixture.diagramName)

      // Tree pip is the reliable signal; canvas lock-chip appears once blocked state settles.
      await expectForeignLockPip(collabPage, fixture.diagramName)
      const lockChip = collabPage.locator('.lock-chip')
      await expect(lockChip).toBeVisible({ timeout: 20000 })
      await expect(lockChip).toContainText(/E2E|LockOwner|User|Collab|e2e/i)

      // Soft check: if live collab WS is up, owner may see spectator avatars.
      const spectators = ownerPage.locator('.model-header__spectators')
      if (await spectators.isVisible().catch(() => false)) {
        await expect(spectators.locator('.model-header__spectator-avatar').first()).toBeVisible()
      }
    } finally {
      if (fixture) {
        await cleanupDiagramLockFixture(ownerPage, fixture)
      }
      await collabContext.close()
      await ownerContext.close()
    }
  })
})
