<script setup lang="ts">
import BottomNav from './BottomNav.vue'
</script>

<template>
  <div class="flex flex-col h-full max-w-lg mx-auto">
    <main class="flex-1 overflow-y-auto" style="padding-bottom: env(safe-area-inset-bottom, 0px);">
      <router-view />
    </main>
    <BottomNav />
  </div>
</template>
