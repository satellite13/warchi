<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"
import { buildVersionTree, type VersionTreeItem } from "@/utils/versionTree"
import BaseModal from "./BaseModal.vue"
import VersionTreeNode from "./VersionTreeNode.vue"

const props = defineProps<{
  groupName: string
  items: VersionTreeItem[]
  /** Префикс ключей i18n, например 'models' или 'notations'. */
  i18nPrefix: string
}>()

const emit = defineEmits<{
  open: [id: string]
  close: []
}>()

const { t } = useI18n()

const tree = computed(() => buildVersionTree(props.items))

const isEmpty = computed(() => props.items.length === 0)

const hasMultipleRoots = computed(() => tree.value.length > 1)

const titleKey = computed(() => `${props.i18nPrefix}.versionTreeTitle`)
const emptyKey = computed(() => `${props.i18nPrefix}.versionTreeEmpty`)
const multipleRootsKey = computed(() => `${props.i18nPrefix}.versionTreeMultipleRoots`)

function openItem(id: string) {
  emit("open", id)
  emit("close")
}
</script>

<template>
  <BaseModal
    :title="t(titleKey, { name: groupName })"
    max-width="420px"
    @close="emit('close')"
  >
    <p v-if="isEmpty" class="version-tree__empty">
      {{ t(emptyKey) }}
    </p>
    <div v-else class="version-tree">
      <p v-if="hasMultipleRoots" class="version-tree__hint">
        {{ t(multipleRootsKey) }}
      </p>
      <ul class="version-tree__list version-tree__list--root">
        <VersionTreeNode
          v-for="node in tree"
          :key="node.item.id"
          :node="node"
          :is-root="true"
          @open="openItem"
        />
      </ul>
    </div>
    <template #footer>
      <button type="button" class="btn btn--secondary" @click="emit('close')">
        {{ t("common.close") }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.version-tree__empty,
.version-tree__hint {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-muted);
}

.version-tree__hint {
  margin-bottom: 12px;
}

.version-tree__list--root {
  list-style: none;
  margin: 0;
  padding: 0;
  border: none;
}

.version-tree__list--root > .version-tree__node {
  margin-bottom: 8px;
}

.version-tree__list--root > .version-tree__node:last-child {
  margin-bottom: 0;
}
</style>
