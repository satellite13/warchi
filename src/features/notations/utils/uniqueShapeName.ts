export function nextUniqueShapeName(baseName: string, takenNames: Set<string>): string {
  const takenLower = new Set([...takenNames].map((n) => n.toLowerCase()))
  const base = baseName.trim() || 'Imported shape'
  if (!takenLower.has(base.toLowerCase())) return base
  let n = 2
  while (takenLower.has(`${base} (${n})`.toLowerCase())) n += 1
  return `${base} (${n})`
}
