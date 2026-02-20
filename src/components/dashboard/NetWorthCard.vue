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
  <div class="bg-primary rounded-2xl p-5 text-white">
    <div class="flex justify-between items-start">
      <div class="flex items-center gap-2">
        <p class="text-sm opacity-80">淨值</p>
        <button @click="toggleHidden" class="opacity-70 active:opacity-100">
          <EyeOff v-if="hidden" :size="16" />
          <Eye v-else :size="16" />
        </button>
      </div>
      <p v-if="syncLabel" class="text-xs opacity-60">{{ syncLabel }}</p>
    </div>
    <p class="text-3xl font-bold mt-1">{{ hidden ? mask : formatCurrency(store.netWorth) }}</p>
    <div class="flex gap-6 mt-4 text-sm">
      <div>
        <p class="opacity-70">總資產</p>
        <p class="font-semibold text-asset-light">{{ hidden ? mask : formatCompact(store.totalAssets) }}</p>
      </div>
      <div>
        <p class="opacity-70">總負債</p>
        <p class="font-semibold text-liability-light">{{ hidden ? mask : formatCompact(store.totalLiabilities) }}</p>
      </div>
    </div>
  </div>
</template>
