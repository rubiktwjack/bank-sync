<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <header class="sticky top-0 bg-surface/90 backdrop-blur-sm border-b border-border z-40">
    <div class="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
      <h1 class="text-lg font-bold text-text-primary">{{ title || 'Rex 資產總覽' }}</h1>
      <slot name="actions" />
    </div>
  </header>
</template>
