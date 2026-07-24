import type { EditorRelationRule } from '../types'

export type CopyRelationRulesMode = 'merge' | 'replace'

export function copyRelationRulesFromComponent(
  _rules: EditorRelationRule[],
  _sourceComponentId: string,
  _targetComponentId: string,
  _mode: CopyRelationRulesMode,
  _createId: () => string,
): { changed: boolean } {
  throw new Error('not implemented')
}
