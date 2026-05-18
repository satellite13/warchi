import { describe, expect, it } from 'vitest'

import { buildImportDraft } from './oefDraftBuilder'
import { parseOefXml } from './oefParser'
import mainXml from './__fixtures__/Main.xml?raw'

describe('oefDraftBuilder', () => {
  it('builds import draft from parsed OEF', () => {
    const parsed = parseOefXml(mainXml)
    const draft = buildImportDraft(parsed)

    expect(draft.sourceModelId).toBe(parsed.model.id)
    expect(draft.sourceModelName).toBe('Main')
    expect(draft.nodes).toHaveLength(6)
    expect(draft.links).toHaveLength(5)
    expect(draft.diagrams).toHaveLength(1)
    expect(draft.diagrams[0]?.nodeInstances).toHaveLength(6)
    expect(draft.diagrams[0]?.connectionInstances).toHaveLength(5)
    expect(draft.sourceElementTypes).toEqual(['BusinessEvent', 'BusinessProcess', 'BusinessService'])
    expect(draft.sourceRelationshipTypes).toEqual(['Serving', 'Triggering'])
  })
})
