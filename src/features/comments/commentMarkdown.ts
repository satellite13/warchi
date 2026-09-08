import { marked } from 'marked'
import { sanitizeMarkdownHtml } from '@/utils/sanitizeMarkdownHtml'

const MENTION_TOKEN_REGEX = /@\[([^\]]*)]\((user|oidc):([^)]+)\)/g
// eslint-disable-next-line no-useless-escape -- символы-ограничители URL в markdown
const URL_REGEX = /https?:\/\/[^\s<>()\[\]{}"']+/g

/** Рендер markdown комментария: упоминания → подсвеченный span, автолинки, санитайз. */
export function renderCommentHtml(bodyMd: string): string {
  const withMentionTokens = escapeHtml(bodyMd).replace(
    MENTION_TOKEN_REGEX,
    (_m, name: string, id: string) =>
      `<span class="comment-mention" data-user-id="${id}">@${name}</span>`
  )
  const parsed = marked.parse(withMentionTokens, { async: false }) as string
  return sanitizeMarkdownHtml(parsed)
}

/** URL-ы в тексте (для превью-карточки). */
export function extractFirstUrl(bodyMd: string): string | null {
  const match = URL_REGEX.exec(bodyMd)
  if (!match) return null
  return match[0].replace(/[.,)!?;:'"]+$/g, '')
}

/** Валиден ли пользовательский ввод как адрес ссылки для кнопки link. */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
