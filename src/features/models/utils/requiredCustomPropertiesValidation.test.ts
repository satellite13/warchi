import { describe, expect, it } from 'vitest'

import {
  validateRequiredCustomProperties,
  type RequiredCustomPropertyValidationIssue,
} from './requiredCustomPropertiesValidation'
import type { ModelEditorState } from '../types'
import { createEmptyModelEditorState } from '../types'

const prop = (name: string, type: 'string' | 'number' | 'boolean' = 'string') => ({
  id: name,
  name,
  type,
  required: true,
  min: null,
  max: null,
})

function stateWith(partial: Partial<ModelEditorState>): ModelEditorState {
  return {
    ...createEmptyModelEditorState(),
    modelId: 'm1',
    ownerId: 'u1',
    ...partial,
  }
}

describe('validateRequiredCustomProperties', () => {
  it('reports a missing required node type property', () => {
    const issue = validateRequiredCustomProperties({
      state: stateWith({
        nodeTypes: [
          {
            id: 'nt1',
            attrs: JSON.stringify({ customProperties: [prop('code')] }),
          } as never,
        ],
        nodes: [
          {
            id: 'n1',
            name: 'Node A',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              treeOrder: 0,
              notationComponents: {},
              componentProperties: {},
              typeProperties: { code: '' },
            },
          } as never,
        ],
      }),
      activeDiagram: null,
    })

    expect(issue).toEqual<RequiredCustomPropertyValidationIssue>({
      key: 'models.validationNodeTypePropRequired',
      params: { node: 'Node A', prop: 'code' },
    })
  })

  it('reports a missing required diagram-scoped component property', () => {
    const issue = validateRequiredCustomProperties({
      state: stateWith({
        components: [
          {
            id: 'c1',
            name: 'Component A',
            notationId: 'notation1',
            attrs: JSON.stringify({ customProperties: [prop('owner')] }),
          } as never,
        ],
        nodes: [
          {
            id: 'n1',
            name: 'Node A',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              treeOrder: 0,
              notationComponents: { notation1: { componentId: 'c1' } },
              componentProperties: {},
              typeProperties: {},
            },
          } as never,
        ],
      }),
      activeDiagram: null,
    })

    expect(issue).toEqual<RequiredCustomPropertyValidationIssue>({
      key: 'models.validationNodeComponentPropRequired',
      params: { node: 'Node A', prop: 'owner', diagram: 'Component A' },
    })
  })

  it('reports a missing required relation property', () => {
    const issue = validateRequiredCustomProperties({
      state: stateWith({
        relations: [
          {
            id: 'r1',
            name: 'Relation A',
            notationId: 'notation1',
            attrs: JSON.stringify({ customProperties: [prop('weight', 'number')] }),
          } as never,
        ],
        links: [
          {
            id: 'l1',
            parsedAttrs: {
              notationRelations: { notation1: { relationId: 'r1' } },
              relationProperties: {},
            },
          } as never,
        ],
      }),
      activeDiagram: null,
    })

    expect(issue).toEqual<RequiredCustomPropertyValidationIssue>({
      key: 'models.validationLinkPropRequired',
      params: { link: 'Relation A', prop: 'weight' },
    })
  })

  it('ignores clean entities outside the validation candidates', () => {
    const issue = validateRequiredCustomProperties({
      state: stateWith({
        nodeTypes: [
          {
            id: 'nt1',
            attrs: JSON.stringify({ customProperties: [prop('code')] }),
          } as never,
        ],
        nodes: [
          {
            id: 'clean-node',
            name: 'Clean',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              treeOrder: 0,
              notationComponents: {},
              componentProperties: {},
              typeProperties: { code: '' },
            },
          } as never,
        ],
      }),
      activeDiagram: null,
      nodes: [],
      links: [],
    })

    expect(issue).toBeNull()
  })
})
