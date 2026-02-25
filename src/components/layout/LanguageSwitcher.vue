<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLocale } from "../../composables/useLocale";

const { currentLocale, setLocale, supportedLocales } = useLocale();
const { t } = useI18n();
</script>

<template>
  <div class="language-switcher" role="group" :aria-label="t('common.languageSwitcher')">
    <button
      v-for="locale in supportedLocales"
      :key="locale"
      type="button"
      class="language-switcher__button"
      :class="{ 'language-switcher__button--active': currentLocale === locale }"
      @click="setLocale(locale)"
    >
      {{ locale.toUpperCase() }}
    </button>
  </div>
</template>

<style scoped>
.language-switcher {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--surface-muted);
}

.language-switcher__button {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 5px 9px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.language-switcher__button:hover {
  color: var(--base-text);
  background: var(--surface-strong);
}

.language-switcher__button--active {
  color: var(--primary);
  background: var(--primary-soft);
}
</style>
