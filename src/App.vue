<script setup lang="ts">
import { onMounted } from 'vue'
import { useAssetStore } from './stores/assets'
import { loadSyncData } from './composables/useSync'
import AppLayout from './components/layout/AppLayout.vue'

const store = useAssetStore()

onMounted(async () => {
  // 先載入本地 IndexedDB 資料
  await store.loadAll()
  // 然後嘗試載入爬蟲同步資料
  await loadSyncData()
})
</script>

<template>
  <AppLayout />
</template>
