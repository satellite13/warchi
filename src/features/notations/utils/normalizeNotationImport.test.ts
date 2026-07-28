import { describe, it, expect } from 'vitest'
import type { OutlineSegment } from '@/domain/attrs/notationAttrs'
import {
  analyzeNotationImportLocalOnly,
  collectImportShapesFromRaw,
  normalizeNotationImport,
} from './normalizeNotationImport'
import type { NotationEditorState } from '../types'

const rectOutline: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [1, 0]] },
  { type: 'line', points: [[1, 0], [1, 1]] },
  { type: 'line', points: [[1, 1], [0, 1]] },
  { type: 'line', points: [[0, 1], [0, 0]] },
]

const otherOutline: OutlineSegment[] = [
  { type: 'line', points: [[0, 0], [0.5, 0.5]] },
  { type: 'line', points: [[0.5, 0.5], [1, 0]] },
]

const t = (key: string) => key

const context = {
  baseOwnerId: 'owner-session',
  baseNotationId: 'notation-session',
  t,
}

function baseStateWith(overrides: Partial<NotationEditorState>): NotationEditorState {
  return {
    notationId: 'notation-session',
    ownerId: 'owner-session',
    nodeTypes: [
      {
        id: 'local-nt',
        name: 'Node type',
        ownerId: 'owner-session',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      },
    ],
    linkTypes: [
      {
        id: 'local-lt',
        name: 'Link type',
        ownerId: 'owner-session',
        createdAt: null,
        updatedAt: null,
        parsedAttrs: {},
      },
    ],
    components: [],
    relations: [],
    relationRules: [],
    diagramLayer: { version: 1, nodes: [], edges: [] },
    ...overrides,
  }
}

describe('normalizeNotationImport', () => {
  it('loads v2 package shapes from top-level raw.shapes', () => {
    const raw = {
      format: 'warchi-notation-export',
      version: 2,
      exportedAt: '2026-07-23T00:00:00.000Z',
      notation: { id: 'file-notation', name: 'File', version: '1.0.0' },
      state: {
        notationId: 'file-notation',
        ownerId: 'file-owner',
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Component',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
            },
          },
          {
            id: 'c2',
            name: 'Other',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: otherOutline },
            },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
      shapes: [
        { id: 's1', name: 'Pack shape', outline: JSON.stringify(rectOutline) },
      ],
    }

    const { state, pendingShapes } = normalizeNotationImport(raw, context)

    expect(state.notationId).toBe('notation-session')
    expect(state.ownerId).toBe('owner-session')
    expect(pendingShapes.map((shape) => shape.id).sort()).toEqual(['s1', 's2'])
    expect(pendingShapes.find((shape) => shape.id === 's1')?.name).toBe('Pack shape')
    expect(pendingShapes.find((shape) => shape.id === 's2')?.name).toBe('Imported shape')
  })

  it('collectImportShapesFromRaw matches normalize pendingShapes', () => {
    const raw = {
      format: 'warchi-notation-export',
      version: 2,
      exportedAt: '2026-07-23T00:00:00.000Z',
      notation: { id: 'file-notation', name: 'File', version: '1.0.0' },
      state: {
        notationId: 'file-notation',
        ownerId: 'file-owner',
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Component',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
            },
          },
          {
            id: 'c2',
            name: 'Other',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's2', customOutline: otherOutline },
            },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
      shapes: [
        { id: 's1', name: 'Pack shape', outline: JSON.stringify(rectOutline) },
      ],
    }

    const fromHelper = collectImportShapesFromRaw(raw, context.t)
    const { pendingShapes } = normalizeNotationImport(raw, context)
    expect(fromHelper.map((s) => s.id).sort()).toEqual(pendingShapes.map((s) => s.id).sort())
  })

  it('synthesizes pending shapes for v1 bare state with customOutline only', () => {
    const raw = {
      notationId: 'file-notation',
      ownerId: 'file-owner',
      nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
      linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
      components: [
        {
          id: 'c1',
          name: 'Component',
          nodeTypeId: 'nt1',
          parsedAttrs: {
            tags: [],
            customProperties: [],
            diagramStyle: { customShapeId: 'legacy-shape', customOutline: rectOutline },
          },
        },
      ],
      relations: [],
      relationRules: [],
      diagramLayer: { version: 1, nodes: [], edges: [] },
    }

    const { state, pendingShapes } = normalizeNotationImport(raw, context)

    expect(state.notationId).toBe('notation-session')
    expect(state.ownerId).toBe('owner-session')
    expect(pendingShapes).toHaveLength(1)
    expect(pendingShapes[0]).toMatchObject({
      id: 'legacy-shape',
      name: 'Imported shape',
      outline: JSON.stringify(rectOutline),
    })
  })

  it('reads shapes from top-level raw.shapes, not raw.state.shapes', () => {
    const raw = {
      format: 'warchi-notation-export',
      version: 2,
      exportedAt: '2026-07-23T00:00:00.000Z',
      notation: { id: 'file-notation', name: 'File', version: '1.0.0' },
      state: {
        notationId: 'file-notation',
        ownerId: 'file-owner',
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Component',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 'top-level', customOutline: rectOutline },
            },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
        shapes: [{ id: 'state-level', name: 'Wrong', outline: JSON.stringify(otherOutline) }],
      },
      shapes: [{ id: 'top-level', name: 'Top level', outline: JSON.stringify(rectOutline) }],
    }

    const { pendingShapes } = normalizeNotationImport(raw, context)

    expect(pendingShapes).toHaveLength(1)
    expect(pendingShapes[0]?.id).toBe('top-level')
    expect(pendingShapes[0]?.name).toBe('Top level')
  })

  it('strips documentFileId from imported shape attrs', () => {
    const raw = {
      format: 'warchi-notation-export',
      version: 2,
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Component',
            nodeTypeId: 'nt1',
            parsedAttrs: {
              tags: [],
              customProperties: [],
              diagramStyle: { customShapeId: 's1', customOutline: rectOutline },
            },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
      shapes: [
        {
          id: 's1',
          name: 'Shape',
          outline: JSON.stringify(rectOutline),
          attrs: JSON.stringify({ documentFileId: 'doc-1', keep: true }),
        },
      ],
    }

    const { pendingShapes } = normalizeNotationImport(raw, context)

    expect(JSON.parse(pendingShapes[0]!.attrs!)).toEqual({ keep: true })
  })

  it('merges matched component by name keeping local id and marking dirty', () => {
    const base = baseStateWith({
      components: [
        {
          id: 'local-c',
          name: 'Actor',
          version: '1.1.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          parsedAttrs: { tags: ['old'], customProperties: [] },
        },
      ],
    })

    const raw = {
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'imported-c',
            name: 'actor',
            version: '2.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: ['imported'], customProperties: [] },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
    }

    const { state } = normalizeNotationImport(raw, {
      ...context,
      baseState: base,
      localOnlyPolicy: 'keep',
    })

    expect(state.components).toHaveLength(1)
    expect(state.components[0]).toMatchObject({
      id: 'local-c',
      name: 'actor',
      version: '2.0.0',
      parsedAttrs: { tags: ['imported'] },
      _isNew: false,
      _isDirty: true,
      _isDeleted: false,
    })
    expect(state.nodeTypes.find((nt) => nt.id === 'local-nt')).toBeTruthy()
  })

  it('adds import-only component as new', () => {
    const base = baseStateWith({
      components: [
        {
          id: 'local-c',
          name: 'Actor',
          version: '1.1.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
      ],
    })

    const raw = {
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'imported-c',
            name: 'Actor',
            version: '1.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: [], customProperties: [] },
          },
          {
            id: 'imported-new',
            name: 'System',
            version: '1.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: ['new'], customProperties: [] },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
    }

    const { state } = normalizeNotationImport(raw, {
      ...context,
      baseState: base,
      localOnlyPolicy: 'keep',
    })

    const actor = state.components.find((c) => c.name === 'Actor')
    const system = state.components.find((c) => c.name === 'System')
    expect(actor?.id).toBe('local-c')
    expect(system?._isNew).toBe(true)
    expect(system?.id).not.toBe('imported-new')
  })

  it('keeps local-only component when policy is keep', () => {
    const base = baseStateWith({
      components: [
        {
          id: 'local-only',
          name: 'OnlyLocal',
          version: '1.1.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
      ],
    })

    const raw = {
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Imported',
            version: '1.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: [], customProperties: [] },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
    }

    const { state } = normalizeNotationImport(raw, {
      ...context,
      baseState: base,
      localOnlyPolicy: 'keep',
    })

    expect(state.components.find((c) => c.id === 'local-only')?._isDeleted).not.toBe(true)
    expect(state.components.some((c) => c.name === 'Imported' && c._isNew)).toBe(true)
  })

  it('marks local-only component deleted when policy is delete', () => {
    const base = baseStateWith({
      components: [
        {
          id: 'local-only',
          name: 'OnlyLocal',
          version: '1.1.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
      ],
    })

    const raw = {
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'c1',
            name: 'Imported',
            version: '1.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: [], customProperties: [] },
          },
        ],
        relations: [],
        relationRules: [],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
    }

    const { state } = normalizeNotationImport(raw, {
      ...context,
      baseState: base,
      localOnlyPolicy: 'delete',
    })

    expect(state.components.find((c) => c.id === 'local-only')).toMatchObject({
      _isDeleted: true,
    })
  })

  it('remaps relation rules onto preserved component and relation ids', () => {
    const base = baseStateWith({
      components: [
        {
          id: 'local-from',
          name: 'From',
          version: '1.1.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
        {
          id: 'local-to',
          name: 'To',
          version: '1.1.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
      ],
      relations: [
        {
          id: 'local-rel',
          name: 'Uses',
          version: '1.1.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          linkTypeId: 'local-lt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
      ],
      relationRules: [
        {
          id: 'local-rule',
          fromComponentId: 'local-from',
          toComponentId: 'local-to',
          allowedRelationIds: ['local-rel'],
        },
      ],
    })

    const raw = {
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'imp-from',
            name: 'From',
            version: '1.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: [], customProperties: [] },
          },
          {
            id: 'imp-to',
            name: 'To',
            version: '1.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: [], customProperties: [] },
          },
        ],
        relations: [
          {
            id: 'imp-rel',
            name: 'Uses',
            version: '1.0.0',
            linkTypeId: 'lt1',
            parsedAttrs: { tags: ['x'], customProperties: [] },
          },
        ],
        relationRules: [
          {
            id: 'imp-rule',
            fromComponentId: 'imp-from',
            toComponentId: 'imp-to',
            allowedRelationIds: ['imp-rel'],
          },
        ],
        diagramLayer: { version: 1, nodes: [], edges: [] },
      },
    }

    const { state } = normalizeNotationImport(raw, {
      ...context,
      baseState: base,
      localOnlyPolicy: 'keep',
    })

    expect(state.relationRules).toHaveLength(1)
    expect(state.relationRules[0]).toMatchObject({
      id: 'local-rule',
      fromComponentId: 'local-from',
      toComponentId: 'local-to',
      allowedRelationIds: ['local-rel'],
      _isDirty: true,
    })
    expect(state.relations[0]).toMatchObject({
      id: 'local-rel',
      parsedAttrs: { tags: ['x'] },
      _isDirty: true,
    })
  })

  it('analyzeNotationImportLocalOnly reports names missing from file', () => {
    const base = baseStateWith({
      components: [
        {
          id: 'c1',
          name: 'KeepMe',
          version: '1.0.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
        {
          id: 'c2',
          name: 'LocalOnly',
          version: '1.0.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          nodeTypeId: 'local-nt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
      ],
      relations: [
        {
          id: 'r1',
          name: 'OrphanRel',
          version: '1.0.0',
          notationId: 'notation-session',
          ownerId: 'owner-session',
          linkTypeId: 'local-lt',
          createdAt: null,
          updatedAt: null,
          parsedAttrs: { tags: [], customProperties: [] },
        },
      ],
    })

    const raw = {
      state: {
        nodeTypes: [{ id: 'nt1', name: 'Node type', parsedAttrs: {} }],
        linkTypes: [{ id: 'lt1', name: 'Link type', parsedAttrs: {} }],
        components: [
          {
            id: 'imp',
            name: 'KeepMe',
            version: '1.0.0',
            nodeTypeId: 'nt1',
            parsedAttrs: { tags: [], customProperties: [] },
          },
        ],
        relations: [],
        relationRules: [],
      },
    }

    const summary = analyzeNotationImportLocalOnly(raw, base, t)
    expect(summary.componentNames).toEqual(['LocalOnly'])
    expect(summary.relationNames).toEqual(['OrphanRel'])
    expect(summary.total).toBe(2)
  })
})
