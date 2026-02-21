<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <header class="sticky top-0 z-40" style="background: rgba(15, 18, 25, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.06);">
    <div style="padding-top: env(safe-area-inset-top, 0px);"></div>
    <div class="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
      <h1 class="text-lg font-bold text-text-primary">{{ title || 'Rex 資產總覽' }}</h1>
      <slot name="actions" />
    </div>
  </header>
</template>
