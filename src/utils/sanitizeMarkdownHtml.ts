import createDOMPurify from 'dompurify'

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const DOMPURIFY_OPTIONS = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ['a'],
  ADD_ATTR: ['target', 'href'],
  FORBID_ATTR: ['style'],
  FORBID_TAGS: ['style'],
}
const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'svg',
  'math',
])

function isAllowedUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('?')
  ) {
    return true
  }

  try {
    const url = new URL(trimmed, window.location.origin)
    return ALLOWED_URL_PROTOCOLS.has(url.protocol)
  } catch {
    return false
  }
}

export function sanitizeMarkdownHtml(unsafeHtml: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const purifier = createDOMPurify(window)
  const supportsBasicHtml =
    purifier.isSupported !== false &&
    purifier.sanitize('<a href="https://example.com" target="_blank">x</a>', DOMPURIFY_OPTIONS).includes('<a')
  const clean =
    !supportsBasicHtml
      ? unsafeHtml
      : purifier.sanitize(unsafeHtml, DOMPURIFY_OPTIONS)

  const template = document.createElement('template')
  template.innerHTML = clean

  template.content.querySelectorAll('*').forEach((el) => {
    if (BLOCKED_TAGS.has(el.tagName.toLowerCase())) {
      el.remove()
      return
    }

    for (const attr of Array.from(el.attributes)) {
      const attrName = attr.name.toLowerCase()
      if (attrName.startsWith('on') || attrName === 'style') {
        el.removeAttribute(attr.name)
      }
    }
  })

  template.content.querySelectorAll<HTMLElement>('[href], [src], [action]').forEach((el) => {
    for (const attrName of ['href', 'src', 'action']) {
      const value = el.getAttribute(attrName)
      if (value !== null && !isAllowedUrl(value)) {
        el.removeAttribute(attrName)
      }
    }
  })

  template.content.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer')
  })

  return template.innerHTML
}
