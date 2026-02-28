<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

type InsetSides = { top: number; right: number; bottom: number; left: number };
type InsetSyncMode = "none" | "paired" | "all";

const props = withDefaults(
  defineProps<{
    modelValue: InsetSides;
    min?: number;
    max?: number;
    step?: number;
    pairedLabel?: string;
    allLabel?: string;
    topTitle?: string;
    rightTitle?: string;
    bottomTitle?: string;
    leftTitle?: string;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    pairedLabel: undefined,
    allLabel: undefined,
    topTitle: undefined,
    rightTitle: undefined,
    bottomTitle: undefined,
    leftTitle: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: InsetSides): void;
}>();
const { t } = useI18n();

const syncMode = ref<InsetSyncMode>("none");
const resolvedPairedLabel = computed<string>(() => props.pairedLabel ?? t("nodeStyle.syncPair"));
const resolvedAllLabel = computed<string>(() => props.allLabel ?? t("nodeStyle.syncAll"));
const resolvedTopTitle = computed<string>(() => props.topTitle ?? t("nodeStyle.tooltipInsetTop"));
const resolvedRightTitle = computed<string>(() => props.rightTitle ?? t("nodeStyle.tooltipInsetRight"));
const resolvedBottomTitle = computed<string>(() => props.bottomTitle ?? t("nodeStyle.tooltipInsetBottom"));
const resolvedLeftTitle = computed<string>(() => props.leftTitle ?? t("nodeStyle.tooltipInsetLeft"));

function toggleSyncMode(mode: Exclude<InsetSyncMode, "none">): void {
  syncMode.value = syncMode.value === mode ? "none" : mode;
}

function withSync(
  value: InsetSides,
  side: keyof InsetSides,
  next: number,
  mode: InsetSyncMode
): InsetSides {
  if (mode === "all") return { top: next, right: next, bottom: next, left: next };
  if (mode === "paired") {
    if (side === "top" || side === "bottom") return { ...value, top: next, bottom: next };
    return { ...value, right: next, left: next };
  }
  return { ...value, [side]: next };
}

function handleSideInput(side: keyof InsetSides, raw: string): void {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return;
  const next = withSync(props.modelValue, side, parsed, syncMode.value);
  emit("update:modelValue", next);
}
</script>

<template>
  <div class="isides">
    <div class="isides__sync">
      <button
        type="button"
        class="isides__sync-btn"
        :class="{ 'isides__sync-btn--active': syncMode === 'paired' }"
        @click="toggleSyncMode('paired')"
      >{{ resolvedPairedLabel }}</button>
      <button
        type="button"
        class="isides__sync-btn"
        :class="{ 'isides__sync-btn--active': syncMode === 'all' }"
        @click="toggleSyncMode('all')"
      >{{ resolvedAllLabel }}</button>
    </div>
    <div class="isides__grid">
      <label class="isides__field" :title="resolvedTopTitle">
        <span class="isides__label" :title="resolvedTopTitle">T</span>
        <input
          class="isides__input"
          type="number"
          :value="modelValue.top"
          :min="min"
          :max="max"
          :step="step"
          :title="resolvedTopTitle"
          @input="handleSideInput('top', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="isides__field" :title="resolvedRightTitle">
        <span class="isides__label" :title="resolvedRightTitle">R</span>
        <input
          class="isides__input"
          type="number"
          :value="modelValue.right"
          :min="min"
          :max="max"
          :step="step"
          :title="resolvedRightTitle"
          @input="handleSideInput('right', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="isides__field" :title="resolvedBottomTitle">
        <span class="isides__label" :title="resolvedBottomTitle">B</span>
        <input
          class="isides__input"
          type="number"
          :value="modelValue.bottom"
          :min="min"
          :max="max"
          :step="step"
          :title="resolvedBottomTitle"
          @input="handleSideInput('bottom', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="isides__field" :title="resolvedLeftTitle">
        <span class="isides__label" :title="resolvedLeftTitle">L</span>
        <input
          class="isides__input"
          type="number"
          :value="modelValue.left"
          :min="min"
          :max="max"
          :step="step"
          :title="resolvedLeftTitle"
          @input="handleSideInput('left', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.isides {
  display: grid;
  gap: 4px;
}

.isides__sync {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.isides__sync-btn {
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-subtle);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}

.isides__sync-btn--active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.isides__grid {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.isides__field {
  display: grid;
  gap: 2px;
}

.isides__label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  padding-left: 2px;
}

.isides__input {
  width: 100%;
  height: var(--sp-h, 28px);
  padding: 0 7px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  box-sizing: border-box;
}

.isides__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
</style>
