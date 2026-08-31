<script setup lang="ts">
import { computed } from "vue";
import { getDisplayInitials } from "../../utils/userDisplay";

const props = defineProps<{
  label?: string;
  size?: "sm" | "md" | "lg";
}>();

const initials = computed(() => {
  return getDisplayInitials(props.label);
});
</script>

<template>
  <AppTooltip :text="label ?? ''" placement="bottom">
    <span :class="['avatar', `avatar--${size || 'md'}`]">{{ initials }}</span>
  </AppTooltip>
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
