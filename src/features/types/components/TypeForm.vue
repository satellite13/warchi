<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { RouterLink } from "vue-router"
import { useI18n } from "vue-i18n"
import type { TypeItem } from "../composables/useTypeEditor"
import type { CustomProperty } from "../../notations/notationAttrs"
import IconPicker from "@/components/forms/IconPicker.vue"
import UnsavedBadge from "@/components/UnsavedBadge.vue"
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions"
import PropertyRow from "./PropertyRow.vue"

const props = withDefaults(
  defineProps<{
    selectedType: TypeItem
    ownerDisplayName: string
    isDirty: boolean
    isSaving: boolean
    isTypeInUse: boolean
    canShare: boolean
    hasDoc?: boolean
    /** false при шаре VIEW без страницы: скрыть кнопку wiki */
    showDocButton?: boolean
    onMutateProperty?: (propertyId: string, apply: (p: CustomProperty) => void) => void
  }>(),
  { showDocButton: true, onMutateProperty: undefined }
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
    <div class="type-form__header">
      <div class="type-form__title-row">
        <div class="type-form__kind-icon">
          <UiIcon :name="selectedType.kind === 'node' ? DEFAULT_ENTITY_ICONS.nodeType : DEFAULT_ENTITY_ICONS.link" />
        </div>
        <h2 class="type-form__title">
          {{ selectedType.kind === 'node' ? t('types.nodeType') : t('types.linkType') }}
        </h2>
        <button
          v-if="showDocButton"
          type="button"
          class="type-form__doc-btn"
          :title="t('types.documentation')"
          @click="emit('openDoc')"
        >
          <UiIcon name="description" class="type-form__doc-btn-icon" />
          <span v-if="hasDoc" class="type-form__doc-badge">
            <UiIcon name="check" />
          </span>
        </button>
        <UnsavedBadge v-if="isDirty" tooltip-key="types.unsavedChangesHint" />
      </div>
      <div class="type-form__actions">
        <RouterLink
          :to="{ name: 'docs-section', params: { section: 'types' } }"
          class="type-form__help-link"
          :title="t('types.helpTitle')"
        >
          <UiIcon name="help" />
        </RouterLink>
        <button
          v-if="canShare"
          type="button"
          class="btn btn--secondary"
          :disabled="isSaving"
          @click="emit('share')"
        >
          <UiIcon name="share" />
          {{ t("common.share") }}
        </button>
        <button
          v-if="!isTypeInUse"
          type="button"
          class="btn btn--soft-danger"
          :disabled="isSaving"
          @click="emit('delete')"
        >
          <UiIcon name="delete" />
          {{ t("common.delete") }}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="isSaving || !selectedType.name.trim() || !isDirty"
          @click="emit('save')"
        >
          <UiIcon name="save" />
          {{ isSaving ? t("common.saving") : t("common.save") }}
        </button>
      </div>
    </div>

    <div class="type-form__body">
      <!-- Name -->
      <div class="form-section">
        <h3 class="form-section__title">{{ t("types.main") }}</h3>
        <div class="form-row">
          <label class="form-label">{{ t("common.name") }}</label>
          <input
            class="form-input"
            :value="selectedType.name"
            :placeholder="t('types.typeNamePlaceholder')"
            @input="emit('updateName', ($event.target as HTMLInputElement).value)"
          >
        </div>
        <div class="form-row">
          <label class="form-label">{{ t("common.author") }}</label>
          <div class="form-input form-input--readonly">{{ ownerDisplayName }}</div>
        </div>
        <div v-if="selectedType.kind === 'node'" class="form-row">
          <label class="form-label">{{ t("types.icon") }}</label>
          <IconPicker
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
            @input="emit('updateDefaultDirectoryPath', ($event.target as HTMLInputElement).value)"
          >
        </div>
      </div>

      <!-- Custom Properties -->
      <div class="form-section">
        <div class="form-section__header">
          <h3 class="form-section__title">{{ t("types.properties") }}</h3>
          <button
            type="button"
            class="add-btn"
            :title="t('types.addProperty')"
            @click="emit('addProperty')"
          >
            <UiIcon name="add" />
          </button>
        </div>

        <div v-if="selectedType.parsedAttrs.customProperties?.length" class="properties-search">
          <UiIcon name="search" class="properties-search__icon" />
          <input
            v-model="propertySearchQuery"
            class="properties-search__input"
            type="text"
            :placeholder="t('types.filterByPropertyName')"
          >
          <button
            v-if="propertySearchQuery"
            type="button"
            class="properties-search__clear"
            :title="t('types.clearFilter')"
            @click="propertySearchQuery = ''"
          >
            <UiIcon name="close" />
          </button>
        </div>

        <div
          v-if="!selectedType.parsedAttrs.customProperties?.length"
          class="form-section__empty"
        >
          {{ t("types.noProperties") }}
        </div>

        <div v-else-if="filteredCustomProperties.length === 0" class="form-section__empty">
          {{ t("types.noPropertiesByFilter") }}
        </div>

        <div v-else class="properties-list">
          <PropertyRow
            v-for="(property, idx) in filteredCustomProperties"
            :key="property.id"
            :property="property"
            :expanded="expandedIds.has(property.id)"
            :on-mutate-property="(apply) => props.onMutateProperty?.(property.id, apply)"
            :style="{ animationDelay: `${idx * 40}ms` }"
            @toggle="toggleCollapse(property.id)"
            @remove="emit('removeProperty', property.id)"
          />
        </div>
      </div>
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

.type-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 12px;
}

.type-form__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.type-form__kind-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.type-form__kind-icon .ui-icon {
  font-size: 20px;
}

.type-form__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--base-text);
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.type-form__help-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--btn-height);
  padding: 0 20px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  font-family: inherit;
  font-weight: 500;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
  box-sizing: border-box;
}

.type-form__help-link:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

.type-form__help-link .ui-icon {
  width: 18px;
  height: 18px;
}

.type-form__doc-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
  flex-shrink: 0;
}

.type-form__doc-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

.type-form__doc-btn-icon {
  width: 20px;
  height: 20px;
}

.type-form__doc-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--success);
  color: #fff;
  font-size: 10px;
}

.type-form__doc-badge .ui-icon {
  width: 10px;
  height: 10px;
}

.type-form__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.type-form__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Form sections */
.form-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
  animation: fadeSlideIn 0.3s ease both;
}

.form-section:nth-child(2) {
  animation-delay: 60ms;
}

.form-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-section__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.form-section__empty {
  font-size: 13px;
  color: var(--text-subtle);
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
.properties-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.properties-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}

.properties-search__icon {
  font-size: 18px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.properties-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--base-text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.properties-search__input::placeholder {
  color: var(--text-subtle);
}

.properties-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  flex-shrink: 0;
}

.properties-search__clear:hover {
  background: var(--surface-strong);
  color: var(--base-text);
}

.properties-search__clear .ui-icon {
  font-size: 16px;
}
</style>
