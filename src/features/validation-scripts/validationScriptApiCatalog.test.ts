import { describe, it, expect } from 'vitest'
import {
  VALIDATION_SCRIPT_TOP_LEVEL_NAMES,
  getValidationScriptTopLevelNames,
  validationScriptApiCatalog,
} from './validationScriptApiCatalog'

const EXPECTED_TOP_LEVEL = [
  'ctx',
  'report',
  'diagramNodes',
  'diagramLinks',
  'nodesOfType',
  'linksOfType',
  'linksBetween',
  'findDuplicateLinks',
  'componentForNode',
  'relationRules',
]

describe('validationScriptApiCatalog', () => {
  it('exports all expected top-level sandbox names', () => {
    expect(getValidationScriptTopLevelNames()).toEqual(EXPECTED_TOP_LEVEL)
    expect([...VALIDATION_SCRIPT_TOP_LEVEL_NAMES]).toEqual(EXPECTED_TOP_LEVEL)
  })

  it('catalog includes every top-level binding', () => {
    const topLevelLabels = validationScriptApiCatalog
      .filter((item) => !item.parent)
      .map((item) => item.label)
    for (const name of EXPECTED_TOP_LEVEL) {
      expect(topLevelLabels).toContain(name)
    }
  })

  it('includes ctx and report member completions', () => {
    const ctxMembers = validationScriptApiCatalog
      .filter((item) => item.parent === 'ctx')
      .map((item) => item.label)
    expect(ctxMembers).toEqual(expect.arrayContaining(['model', 'diagram', 'notations', 'types']))

    const reportMembers = validationScriptApiCatalog
      .filter((item) => item.parent === 'report')
      .map((item) => item.label)
    expect(reportMembers).toEqual(expect.arrayContaining(['error', 'warn', 'info']))
  })
})
