import { describe, expect, it } from 'vitest'
import { groupImportIssues } from './groupImportIssues'
import type { ImportIssue } from './types'

describe('groupImportIssues', () => {
  it('groups identical codes and keeps sample entity ids', () => {
    const issues: ImportIssue[] = [
      {
        code: 'relationshipEndpointIsRelationship',
        level: 'warning',
        entityId: 'rel-1',
        message: 'Relationship "rel-1" attaches to another relationship and will be imported as diagram-only',
      },
      {
        code: 'relationshipEndpointIsRelationship',
        level: 'warning',
        entityId: 'rel-2',
        message: 'Relationship "rel-2" attaches to another relationship and will be imported as diagram-only',
      },
      {
        code: 'missingElementType',
        level: 'warning',
        entityId: 'el-1',
        message: 'Element "el-1" has no xsi:type',
      },
      {
        code: 'relationshipMissingSource',
        level: 'error',
        entityId: 'rel-3',
        message: 'Relationship "rel-3" points to missing source element "x"',
      },
    ]

    const groups = groupImportIssues(issues)
    expect(groups.map(group => group.code)).toEqual([
      'relationshipMissingSource',
      'missingElementType',
      'relationshipEndpointIsRelationship',
    ])
    expect(groups[2]).toMatchObject({
      code: 'relationshipEndpointIsRelationship',
      count: 2,
      entityIds: ['rel-1', 'rel-2'],
    })
  })
})
