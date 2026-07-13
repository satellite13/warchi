<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Sketch as SketchPicker } from "@ckpack/vue-color";
import { loadJson, saveJson } from "@/utils/localStorage";

const props = defineProps<{
  modelValue: string;
  alphaValue?: number;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:alpha", value: number): void;
}>();

type SketchPayload = {
  hex?: string;
  hex8?: string;
  rgba?: {
    a?: number;
  };
};

const DEFAULT_PRESET_COLORS = [
  "#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321",
  "#417505", "#BD10E0", "#9013FE", "#4A90E2", "#50E3C2",
  "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF",
  "rgba(0,0,0,0)"
] as const;
const RECENT_COLORS_STORAGE_KEY = "warchi.recent-colors";
const MAX_RECENT_COLORS = 8;

const rootEl = ref<HTMLElement | null>(null);
const swatchEl = ref<HTMLButtonElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const isPickerOpen = ref(false);
const popoverStyle = ref<Record<string, string>>({});
const recentColors = ref<string[]>(loadRecentColors());

const presetColors = computed<string[]>(() => {
  const merged = [...recentColors.value, ...DEFAULT_PRESET_COLORS];
  return merged.filter((color, index) => merged.indexOf(color) === index);
});
const hasExternalAlpha = computed<boolean>(() => typeof props.alphaValue === "number");
const pickerModelValue = computed<string>(() => {
  if (!hasExternalAlpha.value) return props.modelValue;
  return withAlpha(props.modelValue, props.alphaValue ?? 1);
});

function updatePopoverPosition(): void {
  if (!swatchEl.value) return;
  const rect = swatchEl.value.getBoundingClientRect();
  popoverStyle.value = {
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.top)}px`,
    transform: "translateY(calc(-100% - 6px))"
  };
}

function togglePicker(): void {
  if (isPickerOpen.value) {
    closePicker();
    return;
  }
  isPickerOpen.value = true;
}

function closePicker(): void {
  addRecentColor(props.modelValue);
  isPickerOpen.value = false;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isPickerOpen.value) return;
  const target = event.target as Node | null;
  if (target && rootEl.value?.contains(target)) return;
  if (target && popoverEl.value?.contains(target)) return;
  closePicker();
}

function handleHexChange(event: Event): void {
  const nextValue = (event.target as HTMLInputElement).value.trim();
  if (hasExternalAlpha.value) {
    const parsedHex8 = parseHexWithAlpha(nextValue);
    if (parsedHex8) {
      emit("update:modelValue", parsedHex8.hex);
      emit("update:alpha", parsedHex8.alpha);
      addRecentColor(parsedHex8.hex);
      return;
    }
  }
  emit("update:modelValue", nextValue);
  addRecentColor(nextValue);
}

function handleSketchChange(payload: SketchPayload): void {
  if (!hasExternalAlpha.value) {
    const valueWithAlpha = payload.hex8 ?? payload.hex;
    if (valueWithAlpha) {
      emit("update:modelValue", valueWithAlpha.toUpperCase());
    }
    return;
  }

  const colorValue = payload.hex ?? stripAlphaHex(payload.hex8);
  if (colorValue) {
    emit("update:modelValue", colorValue.toUpperCase());
  }
  if (typeof payload.rgba?.a === "number") {
    emit("update:alpha", clampAlpha(payload.rgba.a));
  }
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseHexWithAlpha(value: string): { hex: string; alpha: number } | null {
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return { hex: normalized.toUpperCase(), alpha: props.alphaValue ?? 1 };
  }
  if (!/^#[0-9a-fA-F]{8}$/.test(normalized)) return null;
  const hex = normalized.slice(0, 7).toUpperCase();
  const alphaHex = normalized.slice(7, 9);
  const alpha = clampAlpha(parseInt(alphaHex, 16) / 255);
  return { hex, alpha };
}

function alphaToHex(alpha: number): string {
  const clamped = clampAlpha(alpha);
  return Math.round(clamped * 255).toString(16).padStart(2, "0").toUpperCase();
}

function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    return `${color.slice(0, 7).toUpperCase()}${alphaToHex(alpha)}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return `${color.toUpperCase()}${alphaToHex(alpha)}`;
  }
  return color;
}

function stripAlphaHex(color?: string): string | undefined {
  if (!color) return undefined;
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    return color.slice(0, 7);
  }
  return color;
}

function normalizeColor(value: string): string | null {
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  if (/^rgba?\(.+\)$/.test(normalized)) {
    return normalized;
  }
  return null;
}

function loadRecentColors(): string[] {
  const raw = loadJson<string[]>(RECENT_COLORS_STORAGE_KEY) ?? [];
  return raw
    .map((value) => (typeof value === "string" ? normalizeColor(value) : null))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_RECENT_COLORS);
}

function saveRecentColors(colors: string[]): void {
  saveJson(RECENT_COLORS_STORAGE_KEY, colors);
}

function addRecentColor(value: string): void {
  const normalized = normalizeColor(value);
  if (!normalized) return;
  const next = [normalized, ...recentColors.value.filter((item) => item !== normalized)]
    .slice(0, MAX_RECENT_COLORS);
  recentColors.value = next;
  saveRecentColors(next);
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.addEventListener("resize", updatePopoverPosition);
  window.addEventListener("scroll", updatePopoverPosition, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  window.removeEventListener("resize", updatePopoverPosition);
  window.removeEventListener("scroll", updatePopoverPosition, true);
});

watch(isPickerOpen, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  updatePopoverPosition();
});
</script>

<template>
  <div ref="rootEl" class="sp-color">
    <button
      ref="swatchEl"
      type="button"
      class="sp-color__swatch"
      :title="title ?? 'Выбрать цвет'"
      @click="togglePicker"
    >
      <span class="sp-color__preview" :style="{ background: modelValue }"></span>
    </button>
    <input
      type="text"
      class="sp-input sp-input--hex"
      :value="modelValue"
      @change="handleHexChange"
    >
    <Teleport to="body">
      <div
        v-if="isPickerOpen"
        ref="popoverEl"
        class="sp-color__popover"
        :style="popoverStyle"
      >
        <SketchPicker
          :model-value="pickerModelValue"
          :disable-alpha="!hasExternalAlpha"
          :preset-colors="presetColors"
          @update:model-value="handleSketchChange"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sp-color {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.sp-color__swatch {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  padding: 0;
}

.sp-color__swatch:active {
  filter: none;
  opacity: 1;
  background: transparent;
}

.sp-color__swatch:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.sp-color__preview {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 5px;
  box-sizing: border-box;
  background-image:
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
}

.sp-color__swatch:hover .sp-color__preview {
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.sp-color__popover {
  position: fixed;
  z-index: 9999;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.25);
}

.sp-input {
  height: var(--sp-h, 28px);
  padding: 0 7px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius, 6px);
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.sp-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.sp-input--hex {
  flex: 1;
  min-width: 0;
}
</style>
