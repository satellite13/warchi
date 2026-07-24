<script setup lang="ts">
import { useI18n } from "vue-i18n"
import type { RelationMatrixCell } from "../types"

type AxisInfo = {
  title: string
  name: string
  id: string
  nodeTypeName: string | null
  nodesCount: number
  properties: Array<{
    key: string
    values: Array<{ label: string; count: number }>
  }>
}

defineProps<{
  cell: RelationMatrixCell | null
  rowName: string
  columnName: string
  verticalInfo: AxisInfo | null
  horizontalInfo: AxisInfo | null
  linkDetails: Array<
    RelationMatrixCell["items"][number] & {
      customProperties: Array<{ key: string; value: string }>
      usedInDiagrams: Array<{ id: string; name: string; version: string }>
    }
  >
}>()

const emit = defineEmits<{
  openNode: [nodeId: string]
  "open-diagram": [diagramId: string]
}>()
const { t } = useI18n()
</script>

<template>
  <aside class="matrix-details">
    <template v-if="cell">
      <header class="matrix-details__header">
        <h3 class="matrix-details__title">{{ rowName }} -> {{ columnName }}</h3>
        <span class="matrix-details__count">{{ t("models.relationMatrixTotalLabel") }}: {{ cell.total }}</span>
      </header>

      <section v-if="verticalInfo" class="matrix-details__section">
        <h4 class="matrix-details__section-title">{{ verticalInfo.title }}</h4>
        <div class="matrix-details__entity-row">
          <span class="matrix-details__entity-name">{{ verticalInfo.name }}</span>
          <span class="matrix-details__entity-id">{{ verticalInfo.id }}</span>
        </div>
        <div class="matrix-details__entity-meta">
          <span v-if="verticalInfo.nodeTypeName">
            {{ t("models.relationMatrixNodeType") }}: {{ verticalInfo.nodeTypeName }}
          </span>
          <span>{{ t("models.relationMatrixNodesCount") }}: {{ verticalInfo.nodesCount }}</span>
        </div>
        <div class="matrix-details__props">
          <p class="matrix-details__props-title">{{ t("models.relationMatrixCustomProperties") }}</p>
          <div v-if="verticalInfo.properties.length === 0" class="matrix-details__props-empty">
            {{ t("models.relationMatrixNoCustomProperties") }}
          </div>
          <div v-else class="matrix-details__props-list">
            <div v-for="prop in verticalInfo.properties" :key="prop.key" class="matrix-details__prop-row">
              <span class="matrix-details__prop-key">{{ prop.key }}</span>
              <div class="matrix-details__prop-values">
                <span v-for="value in prop.values" :key="`${prop.key}:${value.label}`" class="matrix-details__prop-pill">
                  {{ value.label }} ({{ value.count }})
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="horizontalInfo" class="matrix-details__section">
        <h4 class="matrix-details__section-title">{{ horizontalInfo.title }}</h4>
        <div class="matrix-details__entity-row">
          <span class="matrix-details__entity-name">{{ horizontalInfo.name }}</span>
          <span class="matrix-details__entity-id">{{ horizontalInfo.id }}</span>
        </div>
        <div class="matrix-details__entity-meta">
          <span v-if="horizontalInfo.nodeTypeName">
            {{ t("models.relationMatrixNodeType") }}: {{ horizontalInfo.nodeTypeName }}
          </span>
          <span>{{ t("models.relationMatrixNodesCount") }}: {{ horizontalInfo.nodesCount }}</span>
        </div>
        <div class="matrix-details__props">
          <p class="matrix-details__props-title">{{ t("models.relationMatrixCustomProperties") }}</p>
          <div v-if="horizontalInfo.properties.length === 0" class="matrix-details__props-empty">
            {{ t("models.relationMatrixNoCustomProperties") }}
          </div>
          <div v-else class="matrix-details__props-list">
            <div v-for="prop in horizontalInfo.properties" :key="prop.key" class="matrix-details__prop-row">
              <span class="matrix-details__prop-key">{{ prop.key }}</span>
              <div class="matrix-details__prop-values">
                <span v-for="value in prop.values" :key="`${prop.key}:${value.label}`" class="matrix-details__prop-pill">
                  {{ value.label }} ({{ value.count }})
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="matrix-details__section matrix-details__section--links">
        <h4 class="matrix-details__section-title">{{ t("models.relationMatrixLinksListTitle") }}</h4>
      <div class="matrix-details__list">
        <article v-for="item in linkDetails" :key="item.linkId" class="matrix-details__card">
          <div class="matrix-details__line">
            <button type="button" class="matrix-details__node" @click="emit('openNode', item.sourceNodeId)">
              {{ item.sourceNodeName }}
            </button>
            <span class="matrix-details__arrow">-></span>
            <button type="button" class="matrix-details__node" @click="emit('openNode', item.targetNodeId)">
              {{ item.targetNodeName }}
            </button>
          </div>
          <div class="matrix-details__meta">
            <span>{{ item.relationName }}</span>
          </div>
          <div class="matrix-details__link-extra">
            <p class="matrix-details__props-title">{{ t("models.relationMatrixLinkCustomPropertiesTitle") }}</p>
            <div v-if="item.customProperties.length === 0" class="matrix-details__props-empty">
              {{ t("models.relationMatrixNoCustomProperties") }}
            </div>
            <div v-else class="matrix-details__props-list">
              <div
                v-for="prop in item.customProperties"
                :key="`${item.linkId}:${prop.key}`"
                class="matrix-details__prop-row"
              >
                <span class="matrix-details__prop-key">{{ prop.key }}</span>
                <span class="matrix-details__prop-pill">{{ prop.value }}</span>
              </div>
            </div>
          </div>
          <div class="matrix-details__link-extra">
            <p class="matrix-details__props-title">{{ t("models.relationMatrixLinkDiagramsTitle") }}</p>
            <div v-if="item.usedInDiagrams.length === 0" class="matrix-details__props-empty">
              {{ t("models.relationMatrixNoDiagramsForLink") }}
            </div>
            <div v-else class="matrix-details__prop-values">
              <button
                v-for="diagram in item.usedInDiagrams"
                :key="`${item.linkId}:${diagram.id}`"
                type="button"
                class="matrix-details__prop-pill matrix-details__diagram-pill"
                @click="emit('open-diagram', diagram.id)"
              >
                {{ diagram.name }} {{ diagram.version }}
              </button>
            </div>
          </div>
        </article>
      </div>
      </section>
    </template>
    <p v-else class="matrix-details__empty">{{ t("models.relationMatrixDetailsEmpty") }}</p>
  </aside>
</template>

<style scoped>
.matrix-details {
  height: 100%;
  border-left: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  min-width: 320px;
  overflow: auto;
}

.matrix-details__header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.matrix-details__title {
  margin: 0;
  font-size: 13px;
  color: var(--base-text);
}

.matrix-details__count {
  font-size: 11px;
  color: var(--text-subtle);
}

.matrix-details__list {
  overflow: visible;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.matrix-details__section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.matrix-details__section--links {
  border-bottom: none;
}

.matrix-details__section-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.matrix-details__entity-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.matrix-details__entity-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
}

.matrix-details__entity-id {
  font-size: 11px;
  color: var(--text-subtle);
}

.matrix-details__entity-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--text-muted);
}

.matrix-details__props {
  margin-top: 8px;
}

.matrix-details__props-title {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--text-subtle);
}

.matrix-details__props-empty {
  font-size: 11px;
  color: var(--text-subtle);
}

.matrix-details__props-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.matrix-details__prop-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.matrix-details__prop-key {
  font-size: 11px;
  color: var(--text-muted);
}

.matrix-details__prop-values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.matrix-details__prop-pill {
  font-size: 10px;
  color: var(--base-text);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 6px;
}

.matrix-details__diagram-pill {
  cursor: pointer;
  font: inherit;
}

.matrix-details__diagram-pill:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

.matrix-details__card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--surface-muted);
}

.matrix-details__line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.matrix-details__node {
  border: none;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  padding: 0;
  font: inherit;
}

.matrix-details__arrow {
  color: var(--text-subtle);
}

.matrix-details__meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

.matrix-details__link-extra {
  margin-top: 8px;
}

.matrix-details__badge {
  color: var(--warning);
  font-weight: 600;
}

.matrix-details__empty {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  color: var(--text-subtle);
}
</style>
