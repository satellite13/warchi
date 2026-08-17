<script setup lang="ts">
import AppAlert from '@/components/ui/AppAlert.vue'

defineProps<{
  type: 'error' | 'success'
  message: string
}>()
</script>

<template>
  <AppAlert :type="type" :message="message" />
</template>
