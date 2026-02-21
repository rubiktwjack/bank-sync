<script setup lang="ts">
import BottomNav from './BottomNav.vue'
</script>

<template>
  <div class="flex flex-col h-full max-w-lg mx-auto">
    <main class="flex-1 overflow-y-auto">
      <router-view />
    </main>
    <BottomNav />
  </div>
</template>
