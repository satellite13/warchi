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
  <span :class="['avatar', `avatar--${size || 'md'}`]">
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
}

.avatar--sm {
  width: 24px;
  height: 24px;
  font-size: 10px;
}

.avatar--md {
  width: 28px;
  height: 28px;
  font-size: 12px;
}

.avatar--lg {
  width: 36px;
  height: 36px;
  font-size: 14px;
}
</style>
