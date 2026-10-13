import { describe, expect, it } from 'vitest'
import { isPasteableNodeType, uniquePasteName, useNodeClipboard } from './useNodeClipboard'

describe('useNodeClipboard', () => {
  it('copies payload and hands it to paste (buffer cleared only by explicit clear)', () => {
    const { copied, copyNode, takeCopied, clear } = useNodeClipboard()
    expect(copied.value).toBeNull()
    copyNode({ nodeTypeId: 't1', name: 'Service A', attrs: { dpc: { autoCreated: false } } })
    expect(copied.value?.name).toBe('Service A')
    const payload = takeCopied()
    expect(payload?.name).toBe('Service A')
    // takeCopied does not clear the buffer — multiple pastes are allowed.
    expect(copied.value?.name).toBe('Service A')
    clear()
    expect(copied.value).toBeNull()
    expect(takeCopied()).toBeNull()
  })

  it('refuses to copy auto-created nodes', () => {
    const { copied, copyNode, takeCopied } = useNodeClipboard()
    copyNode({ nodeTypeId: 't1', name: 'Synced', attrs: { dpc: { autoCreated: true } } })
    expect(copied.value).toBeNull()
    expect(takeCopied()).toBeNull()
  })

  it('refuses to copy nodes with typeProperties.autoCreated marker', () => {
    const { copied, copyNode, takeCopied } = useNodeClipboard()
    copyNode({ nodeTypeId: 't1', name: 'Synced', attrs: { typeProperties: { autoCreated: true } } })
    expect(copied.value).toBeNull()
    expect(takeCopied()).toBeNull()
  })

  it('deep-clones attrs so later edits of the source do not leak into the buffer', () => {
    const { copied, copyNode, takeCopied } = useNodeClipboard()
    const attrs = { dpc: { autoCreated: false }, typeProperties: { tier: 'app' } }
    copyNode({ nodeTypeId: 't1', name: 'Service A', attrs })
    const sourceAttrs = attrs as { typeProperties: Record<string, unknown> }
    sourceAttrs.typeProperties.tier = 'changed'
    expect((copied.value?.attrs as typeof attrs).typeProperties.tier).toBe('app')
    const payload = takeCopied()
    payload!.name = 'Mutated'
    expect(copied.value?.name).toBe('Service A')
  })

  it('strips source-scoped dpc and oef keys from copied attrs', () => {
    const { copied, copyNode } = useNodeClipboard()
    copyNode({
      nodeTypeId: 't1',
      name: 'Service A',
      attrs: {
        dpc: { kind: 'appProduct', id: '123', autoCreated: false },
        oef: { entityId: 'business', properties: { autoCreated: 'yes' } },
        typeProperties: { tier: 'app' },
        documentFileId: 'file-1',
      },
    })
    const attrs = copied.value?.attrs as Record<string, unknown>
    expect(attrs).not.toHaveProperty('dpc')
    expect(attrs).not.toHaveProperty('oef')
    // Остальные attrs сохраняются.
    expect(attrs.typeProperties).toEqual({ tier: 'app' })
    expect(attrs.documentFileId).toBe('file-1')
  })

  it('checks auto-created guard on source attrs before sanitization', () => {
    // dpc.autoCreated === true отклоняется ДО снятия dpc — буфер остаётся пустым.
    const { copied, copyNode, clear } = useNodeClipboard()
    clear()
    copyNode({
      nodeTypeId: 't1',
      name: 'Synced',
      attrs: {
        dpc: { kind: 'appProduct', id: '123', autoCreated: true },
        typeProperties: { tier: 'app' },
      },
    })
    expect(copied.value).toBeNull()
  })

  it('shares the buffer across useNodeClipboard calls within the session', () => {
    const first = useNodeClipboard()
    const second = useNodeClipboard()
    first.copyNode({ nodeTypeId: 't1', name: 'Shared', attrs: null })
    expect(second.copied.value?.name).toBe('Shared')
    second.clear()
    expect(first.copied.value).toBeNull()
  })
})

describe('isPasteableNodeType', () => {
  it('rejects a payload whose node type does not exist in the target model', () => {
    // Model B knows only 'nt-model-b'; the buffer still holds Model A's type.
    expect(isPasteableNodeType({ nodeTypeId: 'nt-model-a' }, [{ id: 'nt-model-b' }])).toBe(false)
    expect(isPasteableNodeType({ nodeTypeId: 'nt-model-a' }, [])).toBe(false)
  })

  it('accepts a payload whose node type exists in the target model', () => {
    expect(
      isPasteableNodeType({ nodeTypeId: 'nt-model-a' }, [{ id: 'nt-model-a' }, { id: 'dir' }])
    ).toBe(true)
  })
})

describe('uniquePasteName', () => {
  it('generates unique names on paste collisions', () => {
    // дети папки: ['Service A']
    expect(uniquePasteName('Service A', ['Service A'])).toBe('Service A (copy)')
    expect(uniquePasteName('Service A', ['Service A', 'Service A (copy)'])).toBe(
      'Service A (copy 2)'
    )
  })

  it('keeps the name when there is no collision', () => {
    expect(uniquePasteName('Service B', ['Service A'])).toBe('Service B')
  })

  it('skips occupied suffixes beyond (copy 2)', () => {
    expect(
      uniquePasteName('Service A', ['Service A', 'Service A (copy)', 'Service A (copy 2)'])
    ).toBe('Service A (copy 3)')
  })
})
