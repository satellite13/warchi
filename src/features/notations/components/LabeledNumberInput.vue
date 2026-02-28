<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: number | string;
    min?: number;
    max?: number;
    step?: number;
    tooltip?: string;
  }>(),
  {
    min: undefined,
    max: undefined,
    step: 1,
    tooltip: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
const { t } = useI18n();

function handleInput(raw: string): void {
  emit("update:modelValue", raw);
}

const resolvedTooltip = computed<string>(() => {
  if (props.tooltip) return props.tooltip;
  const normalized = props.label.trim().toUpperCase();
  switch (normalized) {
    case "W":
      return t("nodeStyle.tooltipWidth");
    case "H":
      return t("nodeStyle.tooltipHeight");
    case "R":
      return t("nodeStyle.tooltipRadius");
    case "PT":
      return t("nodeStyle.tooltipPortsTop");
    case "PB":
      return t("nodeStyle.tooltipPortsBottom");
    case "PL":
      return t("nodeStyle.tooltipPortsLeft");
    case "PR":
      return t("nodeStyle.tooltipPortsRight");
    default:
      return props.label;
  }
});
</script>

<template>
  <div class="lnf" :title="resolvedTooltip">
    <span class="lnf__label" :title="resolvedTooltip">{{ label }}</span>
    <input
      type="number"
      class="lnf__input"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :title="resolvedTooltip"
      @input="handleInput(($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped>
.lnf {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.lnf__label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
  padding-left: 2px;
}

.lnf__input {
  width: 100%;
  height: var(--sp-h, 28px);
  padding: 0 7px;
  font-size: 12px;
  font-family: inherit;
  border: 1px solid var(--border);
  border-radius: var(--sp-radius, 6px);
  background: var(--surface-muted);
  color: var(--base-text);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.lnf__input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
</style>
