import { expect, type Page } from '@playwright/test'
import { apiJson, csrfFromPage, currentUser } from './e2eApi'

const XSS_MARKDOWN = [
  '# XSS smoke',
  '',
  '<img src="x" onerror="alert(1)">',
  '<script>alert(1)</script>',
  '[bad](javascript:alert(1))',
  '[good](https://example.com)',
].join('\n')

export type XssDocFixture = {
  nodeTypeId: string
  nodeTypeName: string
  fileId: string
}

/**
 * Creates a node type with a markdown document that contains XSS payloads,
 * registers it in wiki documents, and returns ids for cleanup/assertions.
 */
export async function createXssDocumentFixture(page: Page): Promise<XssDocFixture> {
  const csrf = await csrfFromPage(page)
  const owner = await currentUser(page)
  const stamp = Date.now()
  const nodeTypeName = `E2E-XSS-${stamp}`

  const file = await apiJson<{ id: string }>(page.request, 'POST', '/files/upload-markdown', {
    csrf,
    data: {
      content: XSS_MARKDOWN,
      filename: `xss-smoke-${stamp}.md`,
    },
  })
  if (!file.ok || !file.data?.id) {
    throw new Error(`upload-markdown failed: ${file.status} ${file.raw}`)
  }

  const attrs = JSON.stringify({ documentFileId: file.data.id })
  const nodeType = await apiJson<{ id: string }>(page.request, 'POST', '/node-types', {
    csrf,
    data: {
      name: nodeTypeName,
      ownerId: owner.id,
      attrs,
    },
  })
  if (!nodeType.ok || !nodeType.data?.id) {
    throw new Error(`create node-type failed: ${nodeType.status} ${nodeType.raw}`)
  }

  const docRef = await apiJson(page.request, 'POST', '/documents', {
    csrf,
    data: {
      fileId: file.data.id,
      nodeTypeId: nodeType.data.id,
    },
  })
  if (!docRef.ok) {
    throw new Error(`register document ref failed: ${docRef.status} ${docRef.raw}`)
  }

  return {
    nodeTypeId: nodeType.data.id,
    nodeTypeName,
    fileId: file.data.id,
  }
}

export async function cleanupXssDocumentFixture(page: Page, fixture: XssDocFixture): Promise<void> {
  const csrf = await csrfFromPage(page).catch(() => null)
  if (!csrf) return
  await apiJson(page.request, 'DELETE', `/node-types/${fixture.nodeTypeId}`, { csrf })
  await apiJson(page.request, 'DELETE', `/files/${fixture.fileId}`, { csrf })
}

export async function expectSanitizedMarkdown(page: Page, rootSelector: string): Promise<void> {
  const root = page.locator(rootSelector)
  await expect(root).toBeVisible({ timeout: 15000 })
  const html = await root.innerHTML()
  // Event handlers and script tags must never survive sanitization.
  expect(html).not.toMatch(/onerror\s*=/i)
  expect(html).not.toMatch(/<script\b/i)
  // javascript: must not appear as an actionable URL attribute (literal markdown text is ok).
  expect(html).not.toMatch(/\s(?:href|src|action)=["']\s*javascript:/i)
  // Safe https link from the fixture must remain.
  expect(html).toMatch(/example\.com/)
  // onerror payload was stripped from the img (src may remain as inert "x").
  expect(html).toMatch(/<img\b/i)
}
