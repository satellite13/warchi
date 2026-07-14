import { describe, expect, it } from 'vitest'

import { sanitizeMarkdownHtml } from './sanitizeMarkdownHtml'

describe('sanitizeMarkdownHtml', () => {
  it('removes executable tags and event handlers', () => {
    const html = sanitizeMarkdownHtml(`
      <p>Safe</p>
      <script>alert(1)</script>
      <img src="x" onerror="alert(1)">
      <svg onload="alert(1)"><circle /></svg>
    `)

    expect(html).toContain('<p>Safe</p>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onload')
  })

  it('removes unsafe link protocols including encoded javascript', () => {
    const html = sanitizeMarkdownHtml(`
      <a href="javascript:alert(1)">bad</a>
      <a href="&#106;avascript:alert(1)">encoded</a>
      <a href="vbscript:alert(1)">vb</a>
      <a href="https://example.com/docs">good</a>
    `)

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('vbscript:')
    expect(html).toContain('href="https://example.com/docs"')
  })

  it('adds noopener and noreferrer to links that open a new tab', () => {
    const html = sanitizeMarkdownHtml('<a href="https://example.com" target="_blank">external</a>')

    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
