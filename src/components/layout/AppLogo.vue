<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{
  size?: "sm" | "md" | "lg";
}>();

const { t } = useI18n();
</script>

<template>
  <div :class="['logo', `logo--${size || 'md'}`]">
    <object class="logo__icon" data="/warchi.svg" type="image/svg+xml"/>
    <div class="logo__text">
      <span class="logo__title">wArchi</span>
      <span v-if="size != 'sm'" class="logo__subtitle">{{ t("auth.cardSubtitle") }}</span>
    </div>
  </div>
</template>

<style scoped>
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo__icon {
  flex-shrink: 0;
}

.logo--sm .logo__icon {
  width: 28px;
  height: 28px;
}

.logo--md .logo__icon {
  width: 38px;
  height: 38px;
}

.logo--lg .logo__icon {
  width: 52px;
  height: 52px;
}

.logo__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.logo__title {
  font-weight: 600;
  color: var(--base-text);
  letter-spacing: -0.02em;
}

.logo--sm .logo__title {
  font-size: 15px;
}

.logo--md .logo__title {
  font-size: 19px;
}

.logo--lg .logo__title {
  font-size: 24px;
}

.logo__subtitle {
  color: var(--text-subtle);
  letter-spacing: 0.01em;
}

.logo--sm .logo__subtitle {
  font-size: var(--small-font-size);
}

.logo--md .logo__subtitle {
  font-size: var(--medium-font-size);
}

.logo--lg .logo__subtitle {
  font-size: var(--large-font-size);
}
</style>
