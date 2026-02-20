<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAssetStore } from '../../stores/assets'
import { formatCurrency, formatCompact } from '../../utils/format'
import { lastSyncedAt, syncing, syncError } from '../../composables/useSync'
import { Eye, EyeOff } from 'lucide-vue-next'

const store = useAssetStore()
const hidden = ref(localStorage.getItem('networth-hidden') !== 'false')

function toggleHidden() {
  hidden.value = !hidden.value
  localStorage.setItem('networth-hidden', String(hidden.value))
}

const syncLabel = computed(() => {
  if (syncing.value) return '同步中...'
  if (syncError.value) return '同步失敗'
  if (lastSyncedAt.value) {
    const d = new Date(lastSyncedAt.value)
    return `同步於 ${d.toLocaleDateString('zh-TW')} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
  }
  return ''
})

const mask = '＊＊＊＊＊'
</script>

<template>
  <div class="networth-card rounded-2xl p-5 text-white relative overflow-hidden">
    <div class="flex justify-between items-start relative z-10">
      <div class="flex items-center gap-2">
        <p class="text-sm text-text-secondary">淨值</p>
        <button @click="toggleHidden" class="text-text-secondary hover:text-primary transition-colors cursor-pointer">
          <EyeOff v-if="hidden" :size="16" />
          <Eye v-else :size="16" />
        </button>
      </div>
      <p v-if="syncLabel" class="text-xs text-text-secondary">{{ syncLabel }}</p>
    </div>
    <p class="networth-amount text-3xl font-bold mt-1 relative z-10">
      {{ hidden ? mask : formatCurrency(store.netWorth) }}
    </p>
    <div class="flex gap-6 mt-4 text-sm relative z-10">
      <div>
        <p class="text-text-secondary">總資產</p>
        <p class="font-semibold text-asset">{{ hidden ? mask : formatCompact(store.totalAssets) }}</p>
      </div>
      <div>
        <p class="text-text-secondary">總負債</p>
        <p class="font-semibold text-liability">{{ hidden ? mask : formatCompact(store.totalLiabilities) }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.networth-card {
  background: #1C2030;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.networth-amount {
  font-family: 'Inter', -apple-system, sans-serif;
  color: #F1F5F9;
}
</style>
