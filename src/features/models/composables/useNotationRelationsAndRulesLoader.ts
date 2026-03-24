import { ref, type Ref } from "vue"
import type { ModelEditorState } from "../types"
import {
  fetchAllRelationRulesByNotationIds,
  fetchAllRelationsByNotationId,
} from "./modelNotationRelationsApi"

export function useNotationRelationsAndRulesLoader(state: Ref<ModelEditorState>) {
  const loadedRelationRuleNotationIds = new Set<string>()
  const loadingRelationRuleNotationCounts = ref<Record<string, number>>({})
  const relationRuleLoadsByNotation = new Map<string, Promise<void>>()

  const incrementRelationRuleLoading = (notationId: string): void => {
    const next = { ...loadingRelationRuleNotationCounts.value }
    next[notationId] = (next[notationId] ?? 0) + 1
    loadingRelationRuleNotationCounts.value = next
  }

  const decrementRelationRuleLoading = (notationId: string): void => {
    const next = { ...loadingRelationRuleNotationCounts.value }
    const current = next[notationId] ?? 0
    if (current <= 1) {
      delete next[notationId]
    } else {
      next[notationId] = current - 1
    }
    loadingRelationRuleNotationCounts.value = next
  }

  const isNotationRelationsAndRulesLoading = (notationId: string | null | undefined): boolean => {
    if (!notationId) return false
    return (loadingRelationRuleNotationCounts.value[notationId] ?? 0) > 0
  }

  const ensureNotationRelationsAndRules = async (
    notationId: string,
    options?: { force?: boolean }
  ): Promise<void> => {
    if (!notationId) return
    const force = options?.force === true
    if (!force && loadedRelationRuleNotationIds.has(notationId)) return
    const existingLoad = relationRuleLoadsByNotation.get(notationId)
    if (existingLoad) {
      await existingLoad
      if (!force) return
    }

    incrementRelationRuleLoading(notationId)
    const loadPromise = (async () => {
      const [relations, rules] = await Promise.all([
        fetchAllRelationsByNotationId(notationId),
        fetchAllRelationRulesByNotationIds([notationId], { includeAttrs: false }),
      ])

      const previousRelationIds = new Set(
        state.value.relations.filter(relation => relation.notationId === notationId).map(relation => relation.id)
      )
      for (const relation of relations) {
        previousRelationIds.add(relation.id)
      }

      state.value.relations = [
        ...state.value.relations.filter(relation => relation.notationId !== notationId),
        ...relations,
      ]

      state.value.relationRules = [
        ...state.value.relationRules.filter(rule => !previousRelationIds.has(rule.relationId)),
        ...rules,
      ]

      loadedRelationRuleNotationIds.add(notationId)
    })().finally(() => {
      relationRuleLoadsByNotation.delete(notationId)
      decrementRelationRuleLoading(notationId)
    })
    relationRuleLoadsByNotation.set(notationId, loadPromise)
    await loadPromise
  }

  const resetLoadedNotationIds = (notationIds: string[]): void => {
    loadedRelationRuleNotationIds.clear()
    for (const notationId of notationIds) {
      loadedRelationRuleNotationIds.add(notationId)
    }
  }

  return {
    ensureNotationRelationsAndRules,
    isNotationRelationsAndRulesLoading,
    resetLoadedNotationIds,
  }
}
