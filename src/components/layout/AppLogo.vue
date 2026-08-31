<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
    /** When false, the wArchi wordmark is omitted and shown as a tooltip. */
    showTitle?: boolean
    /** When false, subtitle is only shown as a tooltip on the logo. */
    showSubtitle?: boolean
  }>(),
  {
    size: 'md',
    showTitle: true,
  }
)

const { t } = useI18n()

const subtitleVisible = computed(() => {
  if (props.showSubtitle !== undefined) return props.showSubtitle
  return props.size !== 'sm'
})

const textVisible = computed(() => props.showTitle || subtitleVisible.value)

const logoTitle = computed(() => {
  if (!props.showTitle) return 'wArchi'
  return subtitleVisible.value ? undefined : t('auth.cardSubtitle')
})
</script>

<template>
  <AppTooltip :text="logoTitle ?? ''" placement="bottom">
    <div :class="['logo', `logo--${size}`, { 'logo--icon-only': !textVisible }]">
      <img class="logo__icon" src="/warchi.svg" alt="" />
      <div v-if="textVisible" class="logo__text">
        <span v-if="showTitle" class="logo__title">wArchi</span>
        <span v-if="subtitleVisible" class="logo__subtitle">{{ t('auth.cardSubtitle') }}</span>
      </div>
    </div>
  </AppTooltip>
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

.logo--icon-only {
  gap: 0;
}

.logo--sm .logo__icon {
  width: 28px;
  height: 28px;
}

.logo--md .logo__icon {
  width: 32px;
  height: 32px;
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
  font-size: 16px;
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
