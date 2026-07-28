import { describe, it, expect } from 'vitest'
import type { EditorRelationRule } from '../types'
import { applyRelationRuleCell } from './applyRelationRuleCell'

const rule = (
  partial: Partial<EditorRelationRule> &
    Pick<EditorRelationRule, 'id' | 'fromComponentId' | 'toComponentId' | 'allowedRelationIds'>,
): EditorRelationRule => ({ ...partial })

describe('applyRelationRuleCell', () => {
  it('creates a new rule when none exists', () => {
    const rules: EditorRelationRule[] = []
    let n = 0
    applyRelationRuleCell(rules, 'A', 'B', ['r1', 'r2'], () => `new-${++n}`)
    expect(rules).toEqual([
      {
        id: 'new-1',
        fromComponentId: 'A',
        toComponentId: 'B',
        allowedRelationIds: ['r1', 'r2'],
        _isNew: true,
      },
    ])
  })

  it('dedupes relation ids on create', () => {
    const rules: EditorRelationRule[] = []
    applyRelationRuleCell(rules, 'A', 'B', ['r1', 'r1', 'r2'], () => 'new-1')
    expect(rules[0]?.allowedRelationIds).toEqual(['r1', 'r2'])
  })

  it('updates an existing rule and marks dirty', () => {
    const rules = [rule({ id: '1', fromComponentId: 'A', toComponentId: 'B', allowedRelationIds: ['r1'] })]
    applyRelationRuleCell(rules, 'A', 'B', ['r2'], () => 'unused')
    expect(rules[0]).toMatchObject({
      allowedRelationIds: ['r2'],
      _isDirty: true,
    })
    expect(rules[0]?._isNew).toBeUndefined()
  })

  it('updates a new rule without setting dirty', () => {
    const rules = [
      rule({
        id: '1',
        fromComponentId: 'A',
        toComponentId: 'B',
        allowedRelationIds: ['r1'],
        _isNew: true,
      }),
    ]
    applyRelationRuleCell(rules, 'A', 'B', ['r2'], () => 'unused')
    expect(rules[0]).toMatchObject({
      allowedRelationIds: ['r2'],
      _isNew: true,
    })
    expect(rules[0]?._isDirty).toBeUndefined()
  })

  it('splices out a new rule when clearing', () => {
    const rules = [
      rule({
        id: '1',
        fromComponentId: 'A',
        toComponentId: 'B',
        allowedRelationIds: ['r1'],
        _isNew: true,
      }),
    ]
    applyRelationRuleCell(rules, 'A', 'B', [], () => 'unused')
    expect(rules).toEqual([])
  })

  it('soft-deletes an existing rule when clearing', () => {
    const rules = [rule({ id: '1', fromComponentId: 'A', toComponentId: 'B', allowedRelationIds: ['r1'] })]
    applyRelationRuleCell(rules, 'A', 'B', [], () => 'unused')
    expect(rules[0]).toMatchObject({
      _isDeleted: true,
      _isDirty: true,
    })
  })

  it('no-ops when clearing a missing pair', () => {
    const rules: EditorRelationRule[] = []
    applyRelationRuleCell(rules, 'A', 'B', [], () => 'unused')
    expect(rules).toEqual([])
  })

  it('ignores soft-deleted rules and creates a new one', () => {
    const rules = [
      rule({
        id: '1',
        fromComponentId: 'A',
        toComponentId: 'B',
        allowedRelationIds: ['r1'],
        _isDeleted: true,
      }),
    ]
    applyRelationRuleCell(rules, 'A', 'B', ['r2'], () => 'new-1')
    expect(rules).toHaveLength(2)
    expect(rules[1]).toMatchObject({
      id: 'new-1',
      allowedRelationIds: ['r2'],
      _isNew: true,
    })
  })
})
