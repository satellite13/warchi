<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { useI18n } from "vue-i18n"
import type { TypeItem } from "../composables/useTypeEditor"
import type { CustomProperty } from "../../notations/notationAttrs"
import IconPicker from "@/components/forms/IconPicker.vue"
import PropertyRow from "./PropertyRow.vue"

const props = defineProps<{
  selectedType: TypeItem
  ownerDisplayName: string
  isDirty: boolean
  isSaving: boolean
  isTypeInUse: boolean
  canShare: boolean
  onMutateProperty?: (propertyId: string, apply: (p: CustomProperty) => void) => void
}>()

const emit = defineEmits<{
  save: []
  delete: []
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
</script>

<template>
  <div class="type-form">
    <div class="type-form__header">
      <div class="type-form__title-row">
        <div class="type-form__kind-icon">
          <span class="material-symbols-outlined">
            {{ selectedType.kind === 'node' ? 'category' : 'link' }}
          </span>
        </div>
        <h2 class="type-form__title">
          {{ selectedType.kind === 'node' ? t('types.nodeType') : t('types.linkType') }}
        </h2>
        <span v-if="isDirty" class="dirty-badge" :title="t('types.unsavedChangesHint')">
          <span class="dirty-dot"></span>
          {{ t("types.notSaved") }}
        </span>
      </div>
      <div class="type-form__actions">
        <button
          v-if="canShare"
          type="button"
          class="btn btn--secondary"
          :disabled="isSaving"
          @click="emit('share')"
        >
          <span class="material-symbols-outlined">share</span>
          {{ t("common.share") }}
        </button>
        <button
          v-if="!isTypeInUse"
          type="button"
          class="btn btn--soft-danger"
          :disabled="isSaving"
          @click="emit('delete')"
        >
          <span class="material-symbols-outlined">delete</span>
          {{ t("common.delete") }}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="isSaving || !selectedType.name.trim() || !isDirty"
          @click="emit('save')"
        >
          <span class="material-symbols-outlined">save</span>
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
            <span class="material-symbols-outlined">add</span>
          </button>
        </div>

        <div v-if="selectedType.parsedAttrs.customProperties?.length" class="properties-search">
          <span class="material-symbols-outlined properties-search__icon">search</span>
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
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div
          v-if="!selectedType.parsedAttrs.customProperties?.length"
          class="form-section__empty"
        >
          {{ t("types.noProperties") }}
          <button
            type="button"
            class="link-btn--icon"
            :title="t('types.addProperty')"
            @click="emit('addProperty')"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes pulseGlow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
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

.type-form__kind-icon .material-symbols-outlined {
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

/* Dirty indicator */
.dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--warning);
  background: var(--warning-soft);
  padding: 4px 12px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
  animation: fadeIn 0.2s ease;
}

.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warning);
  flex-shrink: 0;
  animation: pulseGlow 1.5s ease-in-out infinite;
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
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn .material-symbols-outlined {
  font-size: 16px;
}

.add-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  transform: scale(1.08);
}

.link-btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-strong);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.link-btn--icon .material-symbols-outlined {
  font-size: 16px;
}

.link-btn--icon:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
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

.properties-search__clear .material-symbols-outlined {
  font-size: 16px;
}
</style>
