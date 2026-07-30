import { describe, expect, it } from 'vitest'
import { parseTypeAttrs, serializeTypeAttrs } from './notationAttrs'
import { isSystemMarkedType } from '@/utils/systemMarkedType'

describe('type attrs system marker', () => {
  it('round-trips system.hiddenTreeRootType and detects system type', () => {
    const parsed = parseTypeAttrs(
      JSON.stringify({ system: { hiddenTreeRootType: true }, icon: 'folder' }),
    )
    expect(parsed.system).toEqual({ hiddenTreeRootType: true })
    expect(parsed.icon).toBe('folder')
    expect(isSystemMarkedType({ parsedAttrs: parsed })).toBe(true)

    const again = parseTypeAttrs(serializeTypeAttrs(parsed))
    expect(again.system).toEqual({ hiddenTreeRootType: true })
    expect(isSystemMarkedType({ parsedAttrs: again })).toBe(true)
  })

  it('round-trips legacy system: true', () => {
    const parsed = parseTypeAttrs(JSON.stringify({ system: true, kind: 'directory' }))
    expect(parsed.system).toBe(true)
    expect(parsed.kind).toBe('directory')
    expect(isSystemMarkedType({ parsedAttrs: parsed })).toBe(true)
  })
})
