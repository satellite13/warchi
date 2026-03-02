<script setup lang="ts">
import { ref } from "vue"
import { useI18n } from "vue-i18n"
import { DEFAULT_ENTITY_ICONS } from "@/config/iconOptions"
import BaseModal from "../../../components/modals/BaseModal.vue"

defineProps<{
  attrsJson: string
  typeUsages: { notationId: string; notationName: string; elements: { id: string; name: string; version: string }[] }[]
  isLoadingUsages: boolean
  isNewType: boolean
  typeKind: "node" | "link"
}>()

const showAttrs = ref(false)
const showAttrsModal = ref(false)
const showUsages = ref(true)
const { t } = useI18n()
</script>

<template>
  <aside class="type-aside">
    <!-- JSON attrs -->
    <div class="aside-panel">
      <div
        class="aside-panel__title aside-panel__title--toggle"
        role="button"
        tabindex="0"
        @click="showAttrs = !showAttrs"
        @keydown.enter="showAttrs = !showAttrs"
      >
        <UiIcon
          name="expand_more"
          class="aside-panel__chevron"
          :class="{ 'aside-panel__chevron--collapsed': !showAttrs }"
        />
        <UiIcon name="data_object" class="aside-panel__icon" />
        attrs
        <button
          type="button"
          class="aside-panel__expand-btn"
          :title="t('types.openFullscreen')"
          @click.stop="showAttrsModal = true"
        >
          <UiIcon name="open_in_full" />
        </button>
      </div>
      <pre v-if="showAttrs" class="json-preview">{{ attrsJson }}</pre>
    </div>

    <!-- Usages -->
    <div class="aside-panel">
      <div
        class="aside-panel__title aside-panel__title--toggle"
        role="button"
        tabindex="0"
        @click="showUsages = !showUsages"
        @keydown.enter="showUsages = !showUsages"
      >
        <UiIcon
          name="expand_more"
          class="aside-panel__chevron"
          :class="{ 'aside-panel__chevron--collapsed': !showUsages }"
        />
        {{ t("types.usage") }}
        <span v-if="typeUsages.length > 0" class="aside-panel__count">
          {{ typeUsages.reduce((sum, g) => sum + g.elements.length, 0) }}
        </span>
      </div>

      <template v-if="showUsages">
        <div v-if="isLoadingUsages" class="aside-panel__empty">
          <span class="loading-pulse"></span>
          {{ t("common.loading") }}
        </div>
        <div v-else-if="isNewType" class="aside-panel__empty">
          {{ t("types.saveTypeToSeeUsage") }}
        </div>
        <div v-else-if="typeUsages.length === 0" class="aside-panel__empty">
          {{ t("types.notUsed") }}
        </div>
        <div v-else class="usages-groups">
          <div v-for="group in typeUsages" :key="group.notationId" class="usage-group">
            <div class="usage-group__header">
              <UiIcon name="account_tree" class="usage-group__icon" />
              <span class="usage-group__name">{{ group.notationName }}</span>
              <span class="usage-group__count">{{ group.elements.length }}</span>
            </div>
            <ul class="usage-group__list">
              <li v-for="el in group.elements" :key="el.id" class="usage-item">
                <UiIcon :name="typeKind === 'node' ? DEFAULT_ENTITY_ICONS.nodeType : DEFAULT_ENTITY_ICONS.link" class="usage-item__icon" />
                <span class="usage-item__name">{{ el.name }}</span>
                <span class="usage-item__version">{{ el.version }}</span>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </div>

    <!-- Fullscreen modal -->
    <BaseModal
      v-if="showAttrsModal"
      :title="t('types.attrsTitle')"
      max-width="90vw"
      @close="showAttrsModal = false"
    >
      <pre class="json-preview json-preview--fullscreen">{{ attrsJson }}</pre>
    </BaseModal>
  </aside>
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

.type-aside {
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeSlideIn 0.35s ease both;
  animation-delay: 80ms;
}

.aside-panel {
  background: var(--surface);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
}

.aside-panel__title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
}

.aside-panel__title--toggle {
  cursor: pointer;
  user-select: none;
  margin-bottom: 0;
  padding: 2px 0;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.aside-panel__title--toggle:hover {
  color: var(--base-text);
}

.aside-panel__icon {
  font-size: 16px;
}

.aside-panel__chevron {
  font-size: 18px;
  transition: transform 0.2s ease;
}

.aside-panel__chevron--collapsed {
  transform: rotate(-90deg);
}

.aside-panel__count {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--primary);
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: auto;
  min-width: 16px;
  text-align: center;
}

.aside-panel__expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.aside-panel__expand-btn .ui-icon {
  font-size: 15px;
}

.aside-panel__expand-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.aside-panel__empty {
  font-size: 13px;
  color: var(--text-subtle);
  padding-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulseGlow 1s ease-in-out infinite;
  flex-shrink: 0;
}

.json-preview {
  margin: 12px 0 0;
  padding: 12px 14px;
  font-size: 11px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  line-height: 1.55;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease;
}

.json-preview--fullscreen {
  margin: 0;
  max-height: 70vh;
  font-size: 13px;
  line-height: 1.6;
}

/* Usages */
.usages-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
  animation: fadeIn 0.2s ease;
}

.usage-group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.usage-group__icon {
  width: 20px;
  height: 20px;
  color: var(--primary);
  flex-shrink: 0;
}

.usage-group__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--base-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-group__count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-strong);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.usage-group__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.usage-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--base-text);
  transition: background 0.15s ease;
}

.usage-item:hover {
  background: var(--surface-strong);
}

.usage-item__icon {
  width: 20px;
  height: 20px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.usage-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-item__version {
  font-size: 11px;
  color: var(--text-subtle);
  font-family: 'SF Mono', 'Fira Code', monospace;
  flex-shrink: 0;
}
</style>
