import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { apiGet } from '@/composables/useApi'
import { getUserDisplayName } from '@/utils/userDisplay'
import type { NotationMetaResponse, NotationResponse } from '@/types/api'
import type { UserInfo } from '@/types/entities'
import type { EditorDiagram, ModelEditorState } from '../types'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function useNotationVersionBanner(options: {
  state: Ref<ModelEditorState>
  activeDiagram: ComputedRef<EditorDiagram | null>
  activeNotationId: ComputedRef<string | null>
  selectedDiagramId: Ref<string | null>
  t: TranslateFn
  ensureNotationRelationsAndRules: (
    notationId: string,
    options?: { force?: boolean }
  ) => Promise<void>
  setUiError: (message: string) => void
}) {
  const newerNotationVersions = ref<NotationResponse[]>([])
  const fallbackNotationMeta = ref<NotationMetaResponse | null>(null)
  const fallbackNotationMetaLoading = ref(false)
  const fallbackNotationMetaError = ref<string | null>(null)
  const fallbackNotationOwnerDisplayName = ref('')

  const activeDiagramNotationDeleted = computed(() => {
    const notationId = options.activeDiagram.value?.notationId
    if (!notationId) return false
    if (options.state.value.notations.some(item => item.id === notationId)) return false
    return (
      fallbackNotationMeta.value?.id === notationId && fallbackNotationMeta.value.deleted === true
    )
  })

  const activeDiagramNotationName = computed(() => {
    const notationId = options.activeDiagram.value?.notationId
    if (!notationId) return ''
    const notation = options.state.value.notations.find(item => item.id === notationId)
    if (notation) return notation.name
    if (fallbackNotationMeta.value?.id === notationId) {
      const name = fallbackNotationMeta.value.name
      return fallbackNotationMeta.value.deleted
        ? options.t('models.notationNameDeleted', { name })
        : name
    }
    if (fallbackNotationMetaLoading.value) return options.t('models.notationLoading')
    if (fallbackNotationMetaError.value) return fallbackNotationMetaError.value
    return options.t('models.notationUnavailable')
  })

  const activeDiagramNotationVersion = computed(() => {
    const notationId = options.activeDiagram.value?.notationId
    if (!notationId) return ''
    const notation = options.state.value.notations.find(item => item.id === notationId)
    if (notation) return notation.version
    if (fallbackNotationMeta.value?.id === notationId) return fallbackNotationMeta.value.version
    return ''
  })

  const activeDiagramNotationOwnerLabel = computed(() => {
    const notationId = options.activeDiagram.value?.notationId
    if (!notationId) return ''
    if (fallbackNotationMeta.value?.id !== notationId) return ''
    return (
      fallbackNotationOwnerDisplayName.value ||
      fallbackNotationMeta.value.ownerDisplayName ||
      fallbackNotationMeta.value.ownerEmail
    )
  })

  const canOpenActiveDiagramNotation = computed(() => {
    const notationId = options.activeDiagram.value?.notationId
    if (!notationId) return false
    if (activeDiagramNotationDeleted.value) return false
    if (options.state.value.notations.some(item => item.id === notationId)) return true
    return fallbackNotationMeta.value?.id === notationId
  })

  watch(
    options.activeNotationId,
    async notationId => {
      if (!notationId) {
        newerNotationVersions.value = []
        return
      }
      try {
        await options.ensureNotationRelationsAndRules(notationId)
      } catch (error) {
        options.setUiError(
          error instanceof Error
            ? error.message
            : options.t('models.notationRelationRulesLoadFailed')
        )
      }
      const mid = options.state.value.modelId
      const newerPath =
        mid.length > 0
          ? `/notations/${notationId}/newer-versions?modelId=${encodeURIComponent(mid)}`
          : `/notations/${notationId}/newer-versions`
      const result = await apiGet<NotationResponse[]>(newerPath)
      if (result.success) {
        newerNotationVersions.value = result.data
      } else {
        newerNotationVersions.value = []
      }
    },
    { immediate: true }
  )

  watch(
    options.selectedDiagramId,
    async () => {
      const notationId = options.activeNotationId.value
      if (!notationId) return
      try {
        await options.ensureNotationRelationsAndRules(notationId, { force: true })
      } catch (error) {
        options.setUiError(
          error instanceof Error
            ? error.message
            : options.t('models.notationRelationRulesRefreshFailed')
        )
      }
    }
  )

  watch(
    () => options.activeDiagram.value?.notationId ?? null,
    async notationId => {
      fallbackNotationMeta.value = null
      fallbackNotationMetaError.value = null
      fallbackNotationMetaLoading.value = false
      if (!notationId) return
      const hasNotationInState = options.state.value.notations.some(item => item.id === notationId)
      if (hasNotationInState) return

      fallbackNotationMetaLoading.value = true
      const mid = options.state.value.modelId
      const metaPath =
        mid.length > 0
          ? `/notations/${notationId}/meta?modelId=${encodeURIComponent(mid)}`
          : `/notations/${notationId}/meta`
      const result = await apiGet<NotationMetaResponse>(metaPath)
      if (options.activeDiagram.value?.notationId !== notationId) return
      fallbackNotationMetaLoading.value = false
      if (!result.success) {
        fallbackNotationMetaError.value =
          result.error.status === 404
            ? options.t('models.notationMetaUnavailable')
            : result.error.status === 403
              ? options.t('models.notationAccessDenied')
              : options.t('models.notationLoadFailed')
        return
      }
      fallbackNotationMeta.value = result.data
      fallbackNotationOwnerDisplayName.value = result.data.ownerDisplayName?.trim() || ''
      if (fallbackNotationOwnerDisplayName.value) return
      const ownerResult = await apiGet<UserInfo>(`/users/${result.data.ownerId}/public`)
      if (ownerResult.success) {
        fallbackNotationOwnerDisplayName.value = getUserDisplayName(
          ownerResult.data,
          result.data.ownerEmail
        )
      }
    }
  )

  return {
    newerNotationVersions,
    activeDiagramNotationName,
    activeDiagramNotationVersion,
    activeDiagramNotationOwnerLabel,
    activeDiagramNotationDeleted,
    canOpenActiveDiagramNotation,
  }
}
