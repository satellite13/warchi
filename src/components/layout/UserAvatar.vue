<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  email?: string;
  size?: "sm" | "md" | "lg";
}>();

const initials = computed(() => {
  if (!props.email) return "?";
  const name = props.email.split("@")[0] ?? "";
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const second = parts[1]?.[0] ?? "";
    return (first + second).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
});
</script>

<template>
  <span :class="['avatar', `avatar--${size || 'md'}`]" :title="email">
    {{ initials }}
  </span>
</template>

<style scoped>
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #7c5cfc 0%, #2bb896 100%);
  border-radius: 50%;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.avatar--sm {
  width: 26px;
  height: 26px;
  font-size: 10px;
}

.avatar--md {
  width: 30px;
  height: 30px;
  font-size: 12px;
}

.avatar--lg {
  width: 38px;
  height: 38px;
  font-size: 14px;
}
</style>
