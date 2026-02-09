<script setup lang="ts">
defineProps<{
  title: string;
  maxWidth?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const handleOverlayClick = () => {
  emit("close");
};
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="handleOverlayClick">
      <div class="modal" :style="{ maxWidth: maxWidth || '440px' }">
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button class="modal-close" type="button" @click="emit('close')">
            <span class="material-symbols-outlined">cancel</span>
          </button>
        </div>
        <div class="modal-body">
          <slot/>
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer"/>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 100%;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  margin: 16px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  color: var(--base-text);
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s ease;
}

.modal-close svg {
  width: 20px;
  height: 20px;
}

.modal-close:hover {
  background: var(--surface-strong);
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}
</style>
