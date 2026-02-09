<script setup lang="ts">
type EntityKind = "component" | "relation";

type ListItem = {
  id: string;
  kind: EntityKind;
  name: string;
  typeLabel: string;
  tags: string[];
};

defineProps<{
  item: ListItem;
  isActive: boolean;
}>();

const emit = defineEmits<{
  select: [EntityKind, string];
}>();
</script>

<template>
  <div
    class="entity-card"
    :class="{ active: isActive }"
  >
    <button
      type="button"
      class="entity-content"
      @click="emit('select', item.kind, item.id)"
    >
      <div class="entity-header">
        <span
          class="entity-kind"
          :class="item.kind"
        >
          <svg
            v-if="item.kind === 'component'"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="3"
              width="7"
              height="7"
              rx="2"
            />
            <rect
              x="14"
              y="3"
              width="7"
              height="7"
              rx="2"
            />
            <rect
              x="3"
              y="14"
              width="7"
              height="7"
              rx="2"
            />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              cx="5"
              cy="12"
              r="3"
            />
            <circle
              cx="19"
              cy="6"
              r="3"
            />
            <circle
              cx="19"
              cy="18"
              r="3"
            />
            <path d="M8 12h6m-3-6 4-3m-4 15 4-3" />
          </svg>
          {{ item.kind === "component" ? "Компонент" : "Отношение" }}
        </span>
        <span class="entity-type">
          <span
            class="type-icon"
            aria-hidden="true"
          >T</span>
          {{ item.typeLabel }}
        </span>
        <div class="entity-title">
          {{ item.name }}
        </div>
      </div>
      <div
        v-if="item.tags.length"
        class="entity-tags"
      >
        <span
          v-for="tag in item.tags"
          :key="tag"
        >{{ tag }}</span>
      </div>
    </button>
  </div>
</template>

<style scoped>
.entity-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--surface);
}

.entity-card.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.entity-content {
  border: none;
  background: none;
  text-align: left;
  padding: 0;
  cursor: pointer;
  flex: 1;
}

.entity-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.entity-kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-strong);
  color: var(--text-muted);
}

.entity-kind svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.entity-kind.relation {
  background: var(--surface-strong);
  color: var(--text-muted);
}

.entity-type {
  font-size: 12px;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--surface-strong);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.entity-title {
  font-weight: 600;
  font-size: 14px;
}

.entity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.entity-tags span {
  font-size: 11px;
  background: var(--surface-strong);
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
</style>
