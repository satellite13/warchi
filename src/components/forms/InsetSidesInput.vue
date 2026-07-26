<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

type InsetSides = { top: number; right: number; bottom: number; left: number };
type InsetScaleSides = {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
};
type InsetSyncMode = "none" | "paired" | "all";
type InsetSide = keyof InsetSides;

const props = withDefaults(
  defineProps<{
    modelValue: InsetSides;
    /** When provided, shows ∝ checkboxes (content inset only). */
    scaleValue?: InsetScaleSides;
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
    scaleValue: undefined,
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
  (e: "update:scaleValue", value: InsetScaleSides): void;
}>();
const { t } = useI18n();

const syncMode = ref<InsetSyncMode>("none");
const showScale = computed(() => props.scaleValue !== undefined);
const resolvedPairedLabel = computed<string>(() => props.pairedLabel ?? t("nodeStyle.syncPair"));
const resolvedAllLabel = computed<string>(() => props.allLabel ?? t("nodeStyle.syncAll"));
const resolvedTopTitle = computed<string>(() => props.topTitle ?? t("nodeStyle.tooltipInsetTop"));
const resolvedRightTitle = computed<string>(() => props.rightTitle ?? t("nodeStyle.tooltipInsetRight"));
const resolvedBottomTitle = computed<string>(() => props.bottomTitle ?? t("nodeStyle.tooltipInsetBottom"));
const resolvedLeftTitle = computed<string>(() => props.leftTitle ?? t("nodeStyle.tooltipInsetLeft"));
const scaleHint = computed<string>(() => t("nodeStyle.contentInsetScaleHint"));

function toggleSyncMode(mode: Exclude<InsetSyncMode, "none">): void {
  syncMode.value = syncMode.value === mode ? "none" : mode;
}

function withSync(
  value: InsetSides,
  side: InsetSide,
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

function handleSideInput(side: InsetSide, raw: string): void {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return;
  const next = withSync(props.modelValue, side, parsed, syncMode.value);
  emit("update:modelValue", next);
}

function isScaleOn(side: InsetSide): boolean {
  return props.scaleValue?.[side] === true;
}

function handleScaleToggle(side: InsetSide, checked: boolean): void {
  const current = props.scaleValue ?? {};
  const next: InsetScaleSides = { ...current };
  if (checked) next[side] = true;
  else delete next[side];
  emit("update:scaleValue", next);
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
    <p v-if="showScale" class="isides__hint">{{ scaleHint }}</p>
    <div class="isides__grid" :class="{ 'isides__grid--scale': showScale }">
      <div class="isides__field" :title="resolvedTopTitle">
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
        <label
          v-if="showScale"
          class="isides__scale"
          :title="t('nodeStyle.contentInsetScale')"
        >
          <input
            type="checkbox"
            :checked="isScaleOn('top')"
            @change="handleScaleToggle('top', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t("nodeStyle.contentInsetScaleShort") }}</span>
        </label>
      </div>
      <div class="isides__field" :title="resolvedRightTitle">
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
        <label
          v-if="showScale"
          class="isides__scale"
          :title="t('nodeStyle.contentInsetScale')"
        >
          <input
            type="checkbox"
            :checked="isScaleOn('right')"
            @change="handleScaleToggle('right', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t("nodeStyle.contentInsetScaleShort") }}</span>
        </label>
      </div>
      <div class="isides__field" :title="resolvedBottomTitle">
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
        <label
          v-if="showScale"
          class="isides__scale"
          :title="t('nodeStyle.contentInsetScale')"
        >
          <input
            type="checkbox"
            :checked="isScaleOn('bottom')"
            @change="handleScaleToggle('bottom', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t("nodeStyle.contentInsetScaleShort") }}</span>
        </label>
      </div>
      <div class="isides__field" :title="resolvedLeftTitle">
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
        <label
          v-if="showScale"
          class="isides__scale"
          :title="t('nodeStyle.contentInsetScale')"
        >
          <input
            type="checkbox"
            :checked="isScaleOn('left')"
            @change="handleScaleToggle('left', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t("nodeStyle.contentInsetScaleShort") }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.isides {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.isides__sync {
  display: flex;
  gap: 4px;
}

.isides__sync-btn {
  border: 1px solid var(--border, #ddd);
  background: var(--surface, #fff);
  color: var(--text-muted, #5c5c5c);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

.isides__sync-btn--active {
  border-color: var(--primary, #7c5cfc);
  color: var(--primary, #7c5cfc);
}

.isides__hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-subtle, #9a9a9a);
  line-height: 1.3;
}

.isides__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.isides__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.isides__label {
  font-size: 11px;
  color: var(--text-muted, #5c5c5c);
}

.isides__input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--border, #ddd);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  background: var(--surface, #fff);
  color: var(--base-text, #1a1a1a);
}

.isides__scale {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-muted, #5c5c5c);
  cursor: pointer;
  user-select: none;
}

.isides__scale input {
  margin: 0;
}
</style>
