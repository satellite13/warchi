const PAREN_VERSION = /^(.*)\s+(\(\d+\.\d+\.\d+\))$/
const PLAIN_VERSION = /^(.*)\s+(\d+\.\d+\.\d+)$/

/** Имя и хвостовая версия. Версия не должна обрезаться вместе с именем. */
export function splitSelectLabelTail(label: string): { head: string; tail: string } {
  const paren = label.match(PAREN_VERSION)
  if (paren?.[1] !== undefined && paren[2] !== undefined) {
    return { head: paren[1], tail: paren[2] }
  }
  const plain = label.match(PLAIN_VERSION)
  if (plain?.[1] !== undefined && plain[2] !== undefined) {
    return { head: plain[1], tail: plain[2] }
  }
  return { head: label, tail: '' }
}

export function selectMenuContentWidth(
  labels: readonly string[],
  measure: (label: string) => number,
  chromePx: number
): number {
  let max = 0
  for (const label of labels) {
    if (!label) continue
    max = Math.max(max, measure(label))
  }
  return max + chromePx
}

export function measureLabelWidth(label: string, font: string): number {
  const probe = document.createElement('span')
  probe.textContent = label
  probe.style.cssText = `position:fixed;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;font:${font};`
  document.body.appendChild(probe)
  const width = probe.offsetWidth
  probe.remove()
  return width
}
