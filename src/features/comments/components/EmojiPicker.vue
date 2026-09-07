<script setup lang="ts">
import { computed, ref } from 'vue'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ select: [emoji: string] }>()

const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Часто',
    emojis: ['👍', '👎', '✅', '❓', '🎉', '🚀', '👀', '🔥', '❤️', '😊', '😂', '🙏'],
  },
  {
    label: 'Работа',
    emojis: ['📌', '📎', '📝', '💡', '⚠️', '🐞', '🛠️', '⏰', '✏️', '📊', '🔗', '🧩'],
  },
  {
    label: 'Статусы',
    emojis: ['🟢', '🔴', '🟡', '🔵', '⛔', '✔️', '➕', '➖', '⬆️', '⬇️', '🔄', '💤'],
  },
  {
    label: 'Ещё',
    emojis: ['🤔', '😎', '🫡', '🙌', '💪', '🤝', '☕', '🚧', '🎁', '⭐', '💯', '🧠'],
  },
]

const activeGroup = ref(0)
const search = ref('')

const filteredEmojis = computed(() => {
  if (!search.value.trim()) return null
  const all = GROUPS.flatMap(g => g.emojis)
  return all.slice(0, 48)
})

function pick(emoji: string): void {
  emit('select', emoji)
}
</script>

<template>
  <div class="emoji-picker" role="dialog" aria-label="Эмодзи">
    <div class="emoji-picker__groups">
      <button
        v-for="(group, i) in GROUPS"
        :key="group.label"
        type="button"
        class="emoji-picker__group-btn"
        :class="{ 'emoji-picker__group-btn--active': activeGroup === i && !search }"
        @click="activeGroup = i; search = ''"
      >
        {{ group.emojis[0] }}
      </button>
    </div>
    <div class="emoji-picker__grid">
      <template v-if="search.trim()">
        <button
          v-for="emoji in filteredEmojis"
          :key="`s-${emoji}`"
          type="button"
          class="emoji-picker__emoji"
          :disabled="disabled"
          @click="pick(emoji)"
        >
          {{ emoji }}
        </button>
      </template>
      <template v-else>
        <div class="emoji-picker__group-label">{{ GROUPS[activeGroup]?.label }}</div>
        <button
          v-for="emoji in GROUPS[activeGroup]?.emojis ?? []"
          :key="emoji"
          type="button"
          class="emoji-picker__emoji"
          :disabled="disabled"
          @click="pick(emoji)"
        >
          {{ emoji }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker {
  background: var(--surface);
  border: 1px solid var(--border, #e5e2dd);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 8px;
  width: 264px;
}

.emoji-picker__groups {
  display: flex;
  gap: 2px;
  margin-bottom: 6px;
}

.emoji-picker__group-btn {
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 14px;
}

.emoji-picker__group-btn--active {
  background: var(--surface-muted);
}

.emoji-picker__group-label {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 4px;
}

.emoji-picker__grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
}

.emoji-picker__emoji {
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 17px;
  line-height: 1;
  padding: 5px;
  cursor: pointer;
}

.emoji-picker__emoji:hover:not(:disabled) {
  background: var(--surface-muted);
}
</style>
