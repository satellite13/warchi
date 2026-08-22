export type BoundsBox = { x: number; y: number; width: number; height: number }

export function isFullyInside(inner: BoundsBox, outer: BoundsBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y >= outer.y &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function boxesOverlap(a: BoundsBox, b: BoundsBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function centerInside(inner: BoundsBox, outer: BoundsBox): boolean {
  const cx = inner.x + inner.width / 2
  const cy = inner.y + inner.height / 2
  return (
    cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height
  )
}

/**
 * Nodes that must follow a grouping leader: everything fully inside it, plus
 * grouping-enabled descendants (even if they overflow the outer box) and
 * everything those inner groups contain.
 *
 * A single AABB pass over the outer box misses components that sit in an inner
 * group whose frame slightly overflows the outer group.
 */
export function collectNestedGroupFollowers(input: {
  leaderId: string
  ids: string[]
  boundsOf: (id: string) => BoundsBox | null
  isGroupingEnabled: (id: string) => boolean
}): string[] {
  const { leaderId, ids, boundsOf, isGroupingEnabled } = input
  const result = new Set<string>()
  const queue: string[] = [leaderId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const containerId = queue.shift()
    if (!containerId || visited.has(containerId)) continue
    visited.add(containerId)

    const shouldSearch = containerId === leaderId || isGroupingEnabled(containerId)
    if (!shouldSearch) continue
    const container = boundsOf(containerId)
    if (!container) continue

    for (const id of ids) {
      if (id === leaderId || id === containerId || result.has(id)) continue
      const bounds = boundsOf(id)
      if (!bounds) continue
      // The outer frame’s center often sits inside a nested group — do not
      // treat an ancestor box as a follower of its own child.
      if (isFullyInside(container, bounds)) continue

      const fullyInside = isFullyInside(bounds, container)
      const overflowingInnerGroup =
        isGroupingEnabled(id) && boxesOverlap(bounds, container) && centerInside(bounds, container)

      if (fullyInside || overflowingInnerGroup) {
        result.add(id)
        queue.push(id)
      }
    }
  }

  return [...result]
}
