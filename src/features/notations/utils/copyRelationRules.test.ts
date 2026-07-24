import { describe, it, expect } from 'vitest'
import type { EditorRelationRule } from '../types'
import { copyRelationRulesFromComponent } from './copyRelationRules'

const rule = (
  partial: Partial<EditorRelationRule> &
    Pick<EditorRelationRule, 'id' | 'fromComponentId' | 'toComponentId' | 'allowedRelationIds'>,
): EditorRelationRule => ({ ...partial })

describe('copyRelationRulesFromComponent', () => {
  it('returns changed:false and does not mutate when source has no outbound rules', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'B', toComponentId: 'C', allowedRelationIds: ['r1'] }),
    ]
    const before = structuredClone(rules)
    const result = copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new')
    expect(result).toEqual({ changed: false })
    expect(rules).toEqual(before)
  })

  it('remaps self-target A→A to B→B', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'A', toComponentId: 'A', allowedRelationIds: ['r1', 'r2'] }),
    ]
    const result = copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(result).toEqual({ changed: true })
    expect(rules).toContainEqual(
      expect.objectContaining({
        id: 'new-1',
        fromComponentId: 'B',
        toComponentId: 'B',
        allowedRelationIds: ['r1', 'r2'],
        _isNew: true,
      }),
    )
  })

  it('preserves non-self target A→C as B→C', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r1'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(rules.find(r => r.id === 'new-1')).toMatchObject({
      fromComponentId: 'B',
      toComponentId: 'C',
      allowedRelationIds: ['r1'],
      _isNew: true,
    })
  })

  it('merge unions relation ids on existing target rule', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r2', 'r3'] }),
      rule({ id: 'tgt', fromComponentId: 'B', toComponentId: 'C', allowedRelationIds: ['r1', 'r2'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    const merged = rules.find(r => r.id === 'tgt')
    expect(merged?.allowedRelationIds).toEqual(['r1', 'r2', 'r3'])
    expect(merged?._isDirty).toBe(true)
    expect(rules.some(r => r.id === 'new-1')).toBe(false)
  })

  it('merge marks dirty only when not _isNew', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r2'] }),
      rule({
        id: 'tgt',
        fromComponentId: 'B',
        toComponentId: 'C',
        allowedRelationIds: ['r1'],
        _isNew: true,
      }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    const merged = rules.find(r => r.id === 'tgt')
    expect(merged?.allowedRelationIds).toEqual(['r1', 'r2'])
    expect(merged?._isDirty).toBeUndefined()
  })

  it('replace soft-deletes existing outbound and adds copies', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r1'] }),
      rule({ id: 'old', fromComponentId: 'B', toComponentId: 'D', allowedRelationIds: ['r9'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'replace', () => 'new-1')
    const old = rules.find(r => r.id === 'old')
    expect(old?._isDeleted).toBe(true)
    expect(old?._isDirty).toBe(true)
    expect(rules.find(r => r.id === 'new-1')).toMatchObject({
      fromComponentId: 'B',
      toComponentId: 'C',
      allowedRelationIds: ['r1'],
      _isNew: true,
    })
  })

  it('replace splices out _isNew outbound instead of soft-delete', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'src', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r1'] }),
      rule({
        id: 'draft',
        fromComponentId: 'B',
        toComponentId: 'D',
        allowedRelationIds: ['r9'],
        _isNew: true,
      }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'replace', () => 'new-1')
    expect(rules.some(r => r.id === 'draft')).toBe(false)
  })

  it('ignores deleted source rules', () => {
    const rules: EditorRelationRule[] = [
      rule({
        id: 'gone',
        fromComponentId: 'A',
        toComponentId: 'C',
        allowedRelationIds: ['r1'],
        _isDeleted: true,
      }),
    ]
    const result = copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(result).toEqual({ changed: false })
  })

  it('dedupes multiple source rows to the same remapped to', () => {
    let n = 0
    const rules: EditorRelationRule[] = [
      rule({ id: '1', fromComponentId: 'A', toComponentId: 'A', allowedRelationIds: ['r1'] }),
      rule({ id: '2', fromComponentId: 'A', toComponentId: 'A', allowedRelationIds: ['r2'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => `new-${++n}`)
    const created = rules.filter(r => r.fromComponentId === 'B' && !r._isDeleted)
    expect(created).toHaveLength(1)
    expect(created[0]?.toComponentId).toBe('B')
    expect(created[0]?.allowedRelationIds).toEqual(['r1', 'r2'])
  })

  it('does not copy inbound rules X→A', () => {
    const rules: EditorRelationRule[] = [
      rule({ id: 'in', fromComponentId: 'X', toComponentId: 'A', allowedRelationIds: ['r1'] }),
      rule({ id: 'out', fromComponentId: 'A', toComponentId: 'C', allowedRelationIds: ['r2'] }),
    ]
    copyRelationRulesFromComponent(rules, 'A', 'B', 'merge', () => 'new-1')
    expect(rules.some(r => r.fromComponentId === 'X' && r.toComponentId === 'B')).toBe(false)
    expect(rules.find(r => r.id === 'new-1')).toMatchObject({
      fromComponentId: 'B',
      toComponentId: 'C',
    })
  })
})
