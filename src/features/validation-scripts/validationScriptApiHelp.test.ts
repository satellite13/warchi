import { describe, expect, it } from 'vitest'
import { VALIDATION_SCRIPT_TOP_LEVEL_NAMES } from './validationScriptApiCatalog'
import {
  catalogItemKey,
  getValidationScriptApiHelpGroups,
  VALIDATION_SCRIPT_API_STRUCTURES,
} from './validationScriptApiHelp'

describe('validationScriptApiHelp', () => {
  it('groups cover every top-level catalog binding', () => {
    const groups = getValidationScriptApiHelpGroups()
    const labels = new Set(
      groups.flatMap((group) =>
        group.items.filter((item) => !item.parent).map((item) => item.label)
      )
    )
    for (const name of VALIDATION_SCRIPT_TOP_LEVEL_NAMES) {
      expect(labels.has(name)).toBe(true)
    }
  })

  it('builds dotted keys for nested members', () => {
    expect(catalogItemKey({ label: 'model', type: 'property', parent: 'ctx' })).toBe('ctx.model')
    expect(catalogItemKey({ label: 'ctx', type: 'namespace' })).toBe('ctx')
  })

  it('lists compact structures for nodes, links and rules', () => {
    const ids = VALIDATION_SCRIPT_API_STRUCTURES.map((s) => s.id)
    expect(ids).toEqual(
      expect.arrayContaining(['node', 'link', 'relationRule', 'component', 'relation', 'target'])
    )
  })
})
