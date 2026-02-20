<script setup lang="ts">
import { ref } from 'vue'
import TopBar from '../components/layout/TopBar.vue'
import { useAssetStore } from '../stores/assets'
import { triggerSync, triggeringScrape, scrapeStatus, lastSyncedAt } from '../composables/useSync'
import { Database, Info, FileDown, FileUp, RefreshCw } from 'lucide-vue-next'

const store = useAssetStore()
const importStatus = ref('')

async function handleExport() {
  const json = await store.exportBackup()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bank-sync-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await store.importBackup(text)
      importStatus.value = '匯入成功！'
      setTimeout(() => { importStatus.value = '' }, 3000)
    } catch {
      importStatus.value = '匯入失敗，請檢查檔案格式'
      setTimeout(() => { importStatus.value = '' }, 3000)
    }
  }
  input.click()
}

async function clearAllData() {
  if (!confirm('確定要清除所有資料嗎？此操作無法復原。')) return
  await store.importBackup(JSON.stringify({
    version: 1,
    deposits: [],
    foreignDeposits: [],
    creditCards: [],
    loans: [],
    customAssets: [],
  }))
}
</script>

<template>
  <div>
    <TopBar title="更多" />
    <div class="px-4 py-4 space-y-3">
      <!-- 同步 -->
      <div class="bg-surface rounded-2xl overflow-hidden">
        <h3 class="text-xs font-semibold text-text-secondary px-4 pt-4 pb-2">銀行同步</h3>
        <button @click="triggerSync" :disabled="triggeringScrape" class="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-background transition-colors disabled:opacity-50">
          <div class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <RefreshCw :size="18" class="text-primary" :class="{ 'animate-spin': triggeringScrape }" />
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium">立即同步</p>
            <p class="text-xs text-text-secondary">{{ scrapeStatus ?? (lastSyncedAt ? `上次同步: ${new Date(lastSyncedAt).toLocaleString('zh-TW')}` : '觸發 GitHub Actions 爬蟲') }}</p>
          </div>
        </button>
      </div>

      <!-- Data management -->
      <div class="bg-surface rounded-2xl overflow-hidden">
        <h3 class="text-xs font-semibold text-text-secondary px-4 pt-4 pb-2">資料管理</h3>
        <button @click="handleExport" class="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-background transition-colors">
          <div class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileDown :size="18" class="text-primary" />
          </div>
          <div>
            <p class="text-sm font-medium">匯出備份</p>
            <p class="text-xs text-text-secondary">匯出 JSON 備份檔</p>
          </div>
        </button>
        <button @click="handleImport" class="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-background transition-colors">
          <div class="w-9 h-9 rounded-xl bg-asset/10 flex items-center justify-center">
            <FileUp :size="18" class="text-asset" />
          </div>
          <div>
            <p class="text-sm font-medium">匯入備份</p>
            <p class="text-xs text-text-secondary">從 JSON 檔案還原資料</p>
          </div>
        </button>
        <button @click="clearAllData" class="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-background transition-colors">
          <div class="w-9 h-9 rounded-xl bg-liability/10 flex items-center justify-center">
            <Database :size="18" class="text-liability" />
          </div>
          <div>
            <p class="text-sm font-medium text-liability">清除所有資料</p>
            <p class="text-xs text-text-secondary">刪除所有帳戶和資產資料</p>
          </div>
        </button>
      </div>

      <!-- Status -->
      <div v-if="importStatus" class="bg-asset/10 text-asset rounded-xl p-3 text-sm text-center">
        {{ importStatus }}
      </div>

      <!-- About -->
      <div class="bg-surface rounded-2xl overflow-hidden">
        <h3 class="text-xs font-semibold text-text-secondary px-4 pt-4 pb-2">關於</h3>
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Info :size="18" class="text-primary" />
          </div>
          <div>
            <p class="text-sm font-medium">Rex 資產總覽</p>
            <p class="text-xs text-text-secondary">v0.1.0</p>
            <p class="text-xs text-text-secondary mt-0.5">所有資料僅存在你的裝置上</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
