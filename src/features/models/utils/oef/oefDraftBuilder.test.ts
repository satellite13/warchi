import { describe, expect, it } from 'vitest'

import { buildImportDraft } from './oefDraftBuilder'
import { parseOefXml } from './oefParser'
import mainXml from './__fixtures__/Main.xml?raw'
import containerAssocXml from './__fixtures__/container-assoc-to-flow.xml?raw'

describe('oefDraftBuilder', () => {
  it('builds import draft from parsed OEF', () => {
    const parsed = parseOefXml(mainXml)
    const draft = buildImportDraft(parsed)

    expect(draft.sourceModelId).toBe(parsed.model.id)
    expect(draft.sourceModelName).toBe('Main')
    expect(draft.nodes).toHaveLength(6)
    expect(draft.links).toHaveLength(5)
    expect(draft.diagrams).toHaveLength(1)
    expect(draft.diagrams[0]?.nodeInstances).toHaveLength(7)
    expect(draft.diagrams[0]?.connectionInstances).toHaveLength(6)
    expect(draft.sourceElementTypes).toEqual(['BusinessEvent', 'BusinessProcess', 'BusinessService'])
    expect(draft.sourceRelationshipTypes).toEqual(['Serving', 'Triggering'])

    const noteInstance = draft.diagrams[0]?.nodeInstances.find(item => item.isNote)
    expect(noteInstance?.noteText).toBe('Test note')
    const noteLink = draft.diagrams[0]?.connectionInstances.find(item => item.isNoteLink)
    expect(noteLink?.sourceNodeId).toBe('id-c489773e4ebb464db0ec585c9660f0db')
  })

  it('marks Container and Association-to-Flow connection for diagram-only import', () => {
    const draft = buildImportDraft(parseOefXml(containerAssocXml))
    const diagram = draft.diagrams[0]!
    const container = diagram.nodeInstances.find(item => item.isContainer)
    expect(container?.containerLabel).toBe('Group')

    const assoc = diagram.connectionInstances.find(item => item.sourceConnectionId === 'conn-assoc')
    expect(assoc?.isDiagramOnlyLink).toBe(true)
    expect(assoc?.attachesToConnectionId).toBe('conn-flow')
    expect(assoc?.attachEndpoint).toBe('target')
  })
})
