/**
 * Prefer last dragover pointer — drop/dragend clientX/Y are unreliable in some browsers
 * (often 0,0 or offset by chrome UI).
 */
export function clientPointForDrop(
  eventClient: { x: number; y: number },
  lastDragOver: { x: number; y: number } | null | undefined
): { x: number; y: number } {
  if (
    lastDragOver &&
    Number.isFinite(lastDragOver.x) &&
    Number.isFinite(lastDragOver.y) &&
    !(lastDragOver.x === 0 && lastDragOver.y === 0)
  ) {
    return lastDragOver
  }
  return eventClient
}

/** Top-left so the node of given size is centered on the cursor world point. */
export function worldTopLeftCenteredOnCursor(
  world: { x: number; y: number },
  size: { width: number; height: number },
  snap: (value: number) => number = value => value
): { x: number; y: number } {
  return {
    x: snap(world.x - size.width / 2),
    y: snap(world.y - size.height / 2),
  }
}
