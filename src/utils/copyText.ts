function copyWithExecCommand(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.focus()
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } finally {
    document.body.removeChild(area)
  }
  return ok
}

/** Copies text in a click handler. Falls back when Clipboard API is missing (plain HTTP). */
export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Permission or gesture rejected — try the legacy path in the same turn.
    }
  }
  if (!copyWithExecCommand(text)) {
    throw new Error('copy failed')
  }
}
