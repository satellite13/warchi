<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiIcon from '@/components/ui/UiIcon.vue'
import { useFavorites, type FavoriteDiagramItem } from '@/composables/useFavorites'
import { useActivityFormatting } from '@/composables/useActivityFormatting'

const PAGE_SIZE = 20

const router = useRouter()
const { t, locale } = useI18n()
const { loadFavoriteDiagrams, removeFavorite } = useFavorites()

const favorites = ref<FavoriteDiagramItem[]>([])
const total = ref(0)
const isLoading = ref(false)
const isLoadingMore = ref(false)
const errorMessage = ref<string | null>(null)
const removingIds = ref<Set<string>>(new Set())

const hasMore = computed(() => favorites.value.length < total.value)

const { formatRelativeDate } = useActivityFormatting(t, locale)

const loadFavorites = async (): Promise<void> => {
  isLoading.value = true
  errorMessage.value = null
  try {
    const page = await loadFavoriteDiagrams(0, PAGE_SIZE)
    favorites.value = page.items
    total.value = page.total
  } catch {
    errorMessage.value = t('profile.favoritesLoadError')
  } finally {
    isLoading.value = false
  }
}

const showMore = async (): Promise<void> => {
  if (isLoadingMore.value) return
  isLoadingMore.value = true
  try {
    const nextPage = Math.floor(favorites.value.length / PAGE_SIZE)
    const page = await loadFavoriteDiagrams(nextPage, PAGE_SIZE)
    const known = new Set(favorites.value.map((f) => f.id))
    favorites.value = [...favorites.value, ...page.items.filter((f) => !known.has(f.id))]
    total.value = page.total
  } catch {
    errorMessage.value = t('profile.favoritesLoadError')
  } finally {
    isLoadingMore.value = false
  }
}

const openDiagram = (item: FavoriteDiagramItem): void => {
  void router.push({
    name: 'model-editor',
    params: { id: item.modelId },
    query: { diagramId: item.id },
  })
}

const removeFromFavorites = async (item: FavoriteDiagramItem): Promise<void> => {
  const next = new Set(removingIds.value)
  next.add(item.id)
  removingIds.value = next
  const ok = await removeFavorite(item.id)
  const settled = new Set(removingIds.value)
  settled.delete(item.id)
  removingIds.value = settled
  if (!ok) {
    errorMessage.value = t('profile.favoritesRemoveError')
    return
  }
  favorites.value = favorites.value.filter((f) => f.id !== item.id)
  total.value = Math.max(total.value - 1, favorites.value.length)
}

onMounted(loadFavorites)
</script>

<template>
  <section class="panel favorites-panel">
    <div class="panel__head">
      <h2>{{ t('profile.favoritesTitle') }}</h2>
      <p>{{ t('profile.favoritesSubtitle') }}</p>
    </div>

    <div v-if="errorMessage" class="favorites-panel__error">{{ errorMessage }}</div>

    <div v-if="isLoading" class="favorites-panel__skeletons">
      <div v-for="i in 3" :key="i" class="favorites-panel__skeleton" />
    </div>

    <p v-else-if="favorites.length === 0" class="favorites-panel__empty">
      {{ t('profile.favoritesEmpty') }}
    </p>

    <ul v-else class="favorites-panel__list">
      <li v-for="item in favorites" :key="item.id" class="favorites-panel__item">
        <button type="button" class="favorites-panel__link" @click="openDiagram(item)">
          <span class="favorites-panel__name">{{ item.name }}</span>
          <span class="favorites-panel__meta">
            {{ item.modelName }}<template v-if="item.version"> · v{{ item.version }}</template>
            <template v-if="formatRelativeDate(item.updatedAt)">
              · {{ formatRelativeDate(item.updatedAt) }}
            </template>
          </span>
        </button>
        <UiIcon name="favorite" class="favorites-panel__star" />
        <button
          type="button"
          class="favorites-panel__remove"
          :title="t('common.removeFromFavorites')"
          :disabled="removingIds.has(item.id)"
          @click="removeFromFavorites(item)"
        >
          <UiIcon name="close" />
        </button>
      </li>
    </ul>

    <button
      v-if="!isLoading && hasMore"
      type="button"
      class="favorites-panel__more"
      :disabled="isLoadingMore"
      @click="showMore"
    >
      {{ isLoadingMore ? t('common.loading') : t('profile.favoritesShowMore') }}
    </button>
  </section>
</template>

<style scoped>
.favorites-panel__error {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
  margin-bottom: 12px;
}

.favorites-panel__skeletons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.favorites-panel__skeleton {
  height: 44px;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--surface-strong) 25%,
    var(--surface-muted) 50%,
    var(--surface-strong) 75%
  );
  background-size: 400% 100%;
  animation: favorites-shimmer 1.8s ease infinite;
}

@keyframes favorites-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.favorites-panel__empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.favorites-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.favorites-panel__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.favorites-panel__item:hover {
  border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
}

.favorites-panel__link {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.favorites-panel__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--base-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorites-panel__meta {
  font-size: 11px;
  color: var(--text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorites-panel__star {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.favorites-panel__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.favorites-panel__remove:hover:not(:disabled) {
  background: var(--danger-soft);
}

.favorites-panel__remove:disabled {
  opacity: 0.5;
  cursor: default;
}

.favorites-panel__remove .ui-icon {
  width: 14px;
  height: 14px;
}

.favorites-panel__more {
  display: block;
  margin: 10px auto 0;
  border: 1px solid var(--border);
  background: var(--surface-muted);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.favorites-panel__more:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  color: var(--primary);
}

.favorites-panel__more:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
