<script setup lang="ts">

defineProps<{
  size?: "sm" | "md" | "lg";
}>();
</script>

<template>
  <div :class="['logo', `logo--${size || 'md'}`]">
    <object class="logo__icon" data="/warchi.svg" type="image/svg+xml"/>
    <div class="logo__text">
      <span class="logo__title">wArchi</span>
      <span class="logo__subtitle">Архитектурный репозиторий</span>
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
  width: 32px;
  height: 32px;
}

.logo--md .logo__icon {
  width: 44px;
  height: 44px;
}

.logo--lg .logo__icon {
  width: 56px;
  height: 56px;
}

.logo__text {
  display: flex;
  flex-direction: column;
}

.logo__title {
  font-weight: var(--base-font-weight);
}

.logo--sm .logo__title {
  font-size: 14px;
}

.logo--md .logo__title {
  font-size: 18px;
}

.logo--lg .logo__title {
  font-size: 22px;
}

.logo__subtitle {
  color: var(--text-subtle);
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
