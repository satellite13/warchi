import type { DiagramScriptCommand } from './diagramScriptCommands'

export type LayoutBounds = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export const STACK_GAP_PX = 8

function cloneBounds(item: LayoutBounds): LayoutBounds {
  return { id: item.id, x: item.x, y: item.y, width: item.width, height: item.height }
}

function toSetBounds(item: LayoutBounds): DiagramScriptCommand {
  return {
    type: 'setBounds',
    instanceId: item.id,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  }
}

function align(items: LayoutBounds[], mode: Extract<DiagramScriptCommand, { type: 'align' }>['mode']): void {
  if (items.length === 0) return
  switch (mode) {
    case 'left': {
      const minX = Math.min(...items.map((n) => n.x))
      for (const item of items) item.x = minX
      break
    }
    case 'center': {
      const centerX = Math.min(...items.map((n) => n.x + n.width / 2))
      for (const item of items) item.x = centerX - item.width / 2
      break
    }
    case 'right': {
      const maxX = Math.max(...items.map((n) => n.x + n.width))
      for (const item of items) item.x = maxX - item.width
      break
    }
    case 'top': {
      const minY = Math.min(...items.map((n) => n.y))
      for (const item of items) item.y = minY
      break
    }
    case 'middle': {
      const centerY = Math.min(...items.map((n) => n.y + n.height / 2))
      for (const item of items) item.y = centerY - item.height / 2
      break
    }
    case 'bottom': {
      const maxY = Math.max(...items.map((n) => n.y + n.height))
      for (const item of items) item.y = maxY - item.height
      break
    }
  }
}

function distribute(items: LayoutBounds[], axis: 'horizontal' | 'vertical'): void {
  if (items.length < 3) return
  if (axis === 'horizontal') {
    const sorted = [...items].sort((a, b) => a.x - b.x)
    const minX = sorted[0]!.x
    const last = sorted[sorted.length - 1]!
    const maxX = last.x + last.width
    const totalWidth = sorted.reduce((sum, n) => sum + n.width, 0)
    const gap = (maxX - minX - totalWidth) / (sorted.length - 1)
    let currentX = minX
    for (const item of sorted) {
      item.x = currentX
      currentX += item.width + gap
    }
    return
  }
  const sorted = [...items].sort((a, b) => a.y - b.y)
  const minY = sorted[0]!.y
  const last = sorted[sorted.length - 1]!
  const maxY = last.y + last.height
  const totalHeight = sorted.reduce((sum, n) => sum + n.height, 0)
  const gap = (maxY - minY - totalHeight) / (sorted.length - 1)
  let currentY = minY
  for (const item of sorted) {
    item.y = currentY
    currentY += item.height + gap
  }
}

function stack(items: LayoutBounds[], mode: 'vertical' | 'overlap'): void {
  if (items.length === 0) return
  const originX = Math.min(...items.map((n) => n.x))
  const originY = Math.min(...items.map((n) => n.y))
  if (mode === 'overlap') {
    for (const item of items) {
      item.x = originX
      item.y = originY
    }
    return
  }
  let currentY = originY
  for (const item of items) {
    item.x = originX
    item.y = currentY
    currentY += item.height + STACK_GAP_PX
  }
}

export function expandLayoutCommands(input: {
  boundsById: Record<string, LayoutBounds>
  commands: DiagramScriptCommand[]
}): DiagramScriptCommand[] {
  const bounds: Record<string, LayoutBounds> = {}
  for (const [id, item] of Object.entries(input.boundsById)) {
    bounds[id] = cloneBounds(item)
  }

  const expanded: DiagramScriptCommand[] = []
  for (const command of input.commands) {
    if (command.type === 'setBounds') {
      const current = bounds[command.instanceId]
      if (current) {
        current.x = command.x
        current.y = command.y
        if (command.width != null) current.width = command.width
        if (command.height != null) current.height = command.height
      }
      expanded.push(command)
      continue
    }
    if (command.type !== 'align' && command.type !== 'distribute' && command.type !== 'stack') {
      expanded.push(command)
      continue
    }
    const items = command.instanceIds
      .map((id) => bounds[id])
      .filter((item): item is LayoutBounds => item != null)
    if (command.type === 'align') align(items, command.mode)
    else if (command.type === 'distribute') distribute(items, command.axis)
    else stack(items, command.mode)
    for (const item of items) {
      expanded.push(toSetBounds(item))
    }
  }
  return expanded
}
