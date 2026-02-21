<script setup lang="ts">
import BottomNav from './BottomNav.vue'
</script>

<template>
  <div class="min-h-full flex flex-col max-w-lg mx-auto">
    <main class="flex-1" style="padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px));">
      <router-view />
    </main>
    <BottomNav />
  </div>
</template>
