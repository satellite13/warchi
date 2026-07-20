import { describe, expect, it } from 'vitest'
import {
  buildOrganizationImportPlan,
  isRelationsOnlyBranch,
  isViewsOnlyBranch,
} from './organizationImport'
import type { OefOrganizationNode } from './types'

const sampleOrgs: OefOrganizationNode[] = [
  {
    label: 'Business',
    children: [
      { refId: 'el-a', refKind: 'element' },
      {
        label: 'Nested',
        children: [{ refId: 'el-b', refKind: 'element' }],
      },
    ],
  },
  {
    label: 'Relations',
    children: [{ refId: 'rel-1', refKind: 'relationship' }],
  },
  {
    label: 'Views',
    children: [{ refId: 'view-1', refKind: 'view' }],
  },
]

describe('organizationImport', () => {
  it('classifies Relations and Views branches', () => {
    expect(isRelationsOnlyBranch(sampleOrgs[1]!)).toBe(true)
    expect(isViewsOnlyBranch(sampleOrgs[2]!)).toBe(true)
    expect(isRelationsOnlyBranch(sampleOrgs[0]!)).toBe(false)
  })

  it('plans directories and parent maps; skips Relations', () => {
    const plan = buildOrganizationImportPlan(sampleOrgs)
    expect(plan.warnings.some(w => w.code === 'relationsBranchSkipped')).toBe(true)
    expect(plan.directories.map(d => d.name)).toEqual(['Business', 'Nested', 'Views'])
    expect(plan.elementParentTempKey.get('el-a')).toBe(plan.directories[0]!.tempKey)
    expect(plan.elementParentTempKey.get('el-b')).toBe(plan.directories[1]!.tempKey)
    expect(plan.directories[1]!.parentTempKey).toBe(plan.directories[0]!.tempKey)
    expect(plan.viewParentTempKey.get('view-1')).toBe(plan.directories[2]!.tempKey)
  })

  it('keeps first folder assignment for duplicate element refs', () => {
    const orgs: OefOrganizationNode[] = [
      {
        label: 'A',
        children: [{ refId: 'el-1', refKind: 'element' }],
      },
      {
        label: 'B',
        children: [{ refId: 'el-1', refKind: 'element' }],
      },
    ]
    const plan = buildOrganizationImportPlan(orgs)
    expect(plan.elementParentTempKey.get('el-1')).toBe(plan.directories[0]!.tempKey)
  })
})
