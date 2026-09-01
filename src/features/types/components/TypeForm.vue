<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import type { TypeItem } from "../composables/useTypeEditor"
import type { CustomProperty } from "@/domain/attrs/notationAttrs"
import IconPicker from "@/components/forms/IconPicker.vue"
import SearchInput from "@/components/forms/SearchInput.vue"
import EditorFormHeader from "@/components/forms/EditorFormHeader.vue"
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions"
import PropertyRow from "@/components/properties/PropertyRow.vue"
import FormSection from "@/components/forms/FormSection.vue"
import EmptyState from "@/components/list/EmptyState.vue"

const props = withDefaults(
  defineProps<{
    selectedType: TypeItem
    ownerDisplayName: string
    isDirty: boolean
    isSaving: boolean
    isTypeInUse: boolean
    canShare: boolean
    /** false for system-marked types (attrs.system) */
    canEdit?: boolean
    hasDoc?: boolean
    /** false при шаре VIEW без страницы: скрыть кнопку wiki */
    showDocButton?: boolean
    onMutateProperty?: (propertyId: string, apply: (p: CustomProperty) => void) => void
  }>(),
  { canEdit: true, showDocButton: true, onMutateProperty: undefined }
)

const emit = defineEmits<{
  save: []
  delete: []
  openDoc: []
  addProperty: []
  removeProperty: [propertyId: string]
  updateName: [value: string]
  updateDefaultDirectoryPath: [value: string]
  updateIcon: [value: string]
  share: []
}>()

const expandedIds = reactive(new Set<string>())
const propertySearchQuery = ref("")
const { t } = useI18n()

const toggleCollapse = (id: string) => {
  if (expandedIds.has(id)) expandedIds.delete(id)
  else expandedIds.add(id)
}

const filteredCustomProperties = computed(() => {
  const allProps = props.selectedType.parsedAttrs.customProperties ?? []
  const query = propertySearchQuery.value.trim().toLowerCase()
  if (!query) return allProps
  return allProps.filter((p) => p.name.toLowerCase().includes(query))
})

watch(
  () => [props.selectedType.id, (props.selectedType.parsedAttrs.customProperties ?? []).map((p) => p.id)] as const,
  ([typeId, nextIds], [prevTypeId, prevIds]) => {
    if (typeId !== prevTypeId) {
      expandedIds.clear()
      return
    }
    const prevSet = new Set(prevIds)
    for (const id of nextIds) {
      if (!prevSet.has(id)) {
        expandedIds.add(id)
      }
    }
  }
)
</script>

<template>
  <div class="type-form">
    <EditorFormHeader
      :title="selectedType.kind === 'node' ? t('types.nodeType') : t('types.linkType')"
      :icon="selectedType.kind === 'node' ? DEFAULT_ENTITY_ICONS.nodeType : DEFAULT_ENTITY_ICONS.link"
      help-docs-section="types"
      :help-title="t('types.helpTitle')"
      :is-dirty="isDirty"
      :is-saving="isSaving"
      :can-edit="canEdit"
      :can-share="canShare"
      :can-delete="canEdit && !isTypeInUse"
      :show-doc-button="showDocButton"
      :has-doc="hasDoc"
      :doc-button-title="t('types.documentation')"
      unsaved-tooltip-key="types.unsavedChangesHint"
      :save-disabled="isSaving || !selectedType.name.trim() || !isDirty"
      @save="emit('save')"
      @delete="emit('delete')"
      @share="emit('share')"
      @open-doc="emit('openDoc')"
    />

    <div class="type-form__body">
      <p v-if="!canEdit" class="type-form__readonly-banner">
        {{ t('types.systemTypeReadOnly') }}
      </p>
      <!-- Name -->
      <FormSection :title="t('types.main')">
        <div class="form-row">
          <label class="form-label">{{ t("common.name") }}</label>
          <input
            class="form-input"
            :value="selectedType.name"
            :placeholder="t('types.typeNamePlaceholder')"
            :disabled="!canEdit"
            @input="emit('updateName', ($event.target as HTMLInputElement).value)"
          >
        </div>
        <div class="form-row">
          <label class="form-label">{{ t("common.author") }}</label>
          <div class="form-input form-input--readonly">{{ ownerDisplayName }}</div>
        </div>
        <div v-if="selectedType.kind === 'node'" class="form-row">
          <label class="form-label">{{ t("types.icon") }}</label>
          <div v-if="!canEdit" class="form-input form-input--readonly">
            {{ selectedType.parsedAttrs.icon || '—' }}
          </div>
          <IconPicker
            v-else
            :model-value="selectedType.parsedAttrs.icon ?? ''"
            @update:model-value="emit('updateIcon', $event)"
          />
        </div>
        <div v-if="selectedType.kind === 'node'" class="form-row">
          <label class="form-label">{{ t("types.directory") }}</label>
          <input
            class="form-input"
            :value="selectedType.parsedAttrs.defaultDirectoryPath ?? ''"
            :placeholder="t('types.directoryExample')"
            :disabled="!canEdit"
            @input="emit('updateDefaultDirectoryPath', ($event.target as HTMLInputElement).value)"
          >
        </div>
      </FormSection>

      <!-- Custom Properties -->
      <FormSection :title="t('types.properties')" animation-delay="60ms">
        <template v-if="canEdit" #header-actions>
          <button
            type="button"
            class="add-btn"
            :title="t('types.addProperty')"
            @click="emit('addProperty')"
          >
            <UiIcon name="add" />
          </button>
        </template>

        <SearchInput
          v-if="selectedType.parsedAttrs.customProperties?.length"
          v-model="propertySearchQuery"
          compact
          :placeholder="t('types.filterByPropertyName')"
        />

        <EmptyState
          v-if="!selectedType.parsedAttrs.customProperties?.length"
          variant="inline"
          :title="t('types.noProperties')"
        />

        <EmptyState
          v-else-if="filteredCustomProperties.length === 0"
          variant="inline"
          :title="t('types.noPropertiesByFilter')"
        />

        <div v-else class="properties-list" :class="{ 'properties-list--readonly': !canEdit }">
          <PropertyRow
            v-for="(property, idx) in filteredCustomProperties"
            :key="property.id"
            :property="property"
            :expanded="expandedIds.has(property.id)"
            :on-mutate-property="
              canEdit ? (apply) => props.onMutateProperty?.(property.id, apply) : undefined
            "
            :style="{ animationDelay: `${idx * 40}ms` }"
            @toggle="toggleCollapse(property.id)"
            @remove="canEdit && emit('removeProperty', property.id)"
          />
        </div>
      </FormSection>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.type-form {
  flex: 1;
  min-width: 0;
}

.type-form__readonly-banner {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.4;
}

.type-form__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}


.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn .ui-icon {
  width: 16px;
  height: 16px;
}

.add-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  transform: scale(1.08);
}

/* Properties */
.properties-list--readonly {
  pointer-events: none;
  opacity: 0.85;
}

.properties-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

</style>
