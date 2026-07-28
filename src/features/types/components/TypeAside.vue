<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/modals/BaseModal.vue'
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue'

const props = defineProps<{
  attrsJson: string
  typeUsages: {
    notationId: string
    notationName: string
    notationIcon?: string
    elements: { id: string; name: string; version: string; icon: string }[]
  }[]
  isLoadingUsages: boolean
  isNewType: boolean
  typeKind: 'node' | 'link'
}>()

const showAttrs = ref(false)
const showAttrsModal = ref(false)
const showUsages = ref(true)
const { t } = useI18n()

const usageCount = computed(() =>
  props.typeUsages.reduce((sum, group) => sum + group.elements.length, 0),
)
</script>

<template>
  <aside class="type-aside">
    <CollapsibleSection
      variant="aside"
      title="attrs"
      :open="showAttrs"
      @toggle="showAttrs = !showAttrs"
    >
      <template #header-leading>
        <UiIcon name="data_object" class="type-aside__leading-icon" />
      </template>
      <template #header-extra>
        <button
          type="button"
          class="type-aside__expand-btn"
          :title="t('types.openFullscreen')"
          @click.stop="showAttrsModal = true"
        >
          <UiIcon name="open_in_full" />
        </button>
      </template>
      <pre class="json-preview">{{ attrsJson }}</pre>
    </CollapsibleSection>

    <CollapsibleSection
      variant="aside"
      :title="t('types.usage')"
      :open="showUsages"
      @toggle="showUsages = !showUsages"
    >
      <template v-if="typeUsages.length > 0" #header-extra>
        <span class="type-aside__count">{{ usageCount }}</span>
      </template>

      <div v-if="isLoadingUsages" class="type-aside__empty">
        <span class="loading-pulse" />
        {{ t('common.loading') }}
      </div>
      <div v-else-if="isNewType" class="type-aside__empty">
        {{ t('types.saveTypeToSeeUsage') }}
      </div>
      <div v-else-if="typeUsages.length === 0" class="type-aside__empty">
        {{ t('types.notUsed') }}
      </div>
      <div v-else class="usages-groups">
        <div v-for="group in typeUsages" :key="group.notationId" class="usage-group">
          <div class="usage-group__header">
            <img
              v-if="group.notationIcon"
              :src="`/icons/${group.notationIcon}.svg`"
              :alt="group.notationName"
              class="usage-group__icon-img"
            >
            <UiIcon v-else name="account_tree" class="usage-group__icon" />
            <span class="usage-group__name">{{ group.notationName }}</span>
            <span class="usage-group__count">{{ group.elements.length }}</span>
          </div>
          <ul class="usage-group__list">
            <li v-for="el in group.elements" :key="el.id" class="usage-item">
              <img :src="`/icons/${el.icon}.svg`" :alt="el.name" class="usage-item__icon-img">
              <span class="usage-item__name">{{ el.name }}</span>
              <span class="usage-item__version">{{ el.version }}</span>
            </li>
          </ul>
        </div>
      </div>
    </CollapsibleSection>

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
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
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

.type-aside__leading-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.type-aside__count {
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

.type-aside__expand-btn {
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

.type-aside__expand-btn .ui-icon {
  width: 15px;
  height: 15px;
}

.type-aside__expand-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.type-aside__empty {
  font-size: 13px;
  color: var(--text-subtle);
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
  margin: 0;
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

.usages-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeIn 0.2s ease;
}

.usage-group__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.usage-group__icon,
.usage-group__icon-img {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.usage-group__icon {
  color: var(--primary);
}

.usage-group__icon-img {
  object-fit: contain;
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

.usage-item__icon-img {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  object-fit: contain;
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
