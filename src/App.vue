<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAssetStore } from './stores/assets'
import { loadSyncData, syncError, setSyncPassword } from './composables/useSync'
import AppLayout from './components/layout/AppLayout.vue'
import { Lock } from 'lucide-vue-next'

const store = useAssetStore()
const showPasswordModal = ref(false)
const passwordInput = ref('')
const passwordError = ref('')

onMounted(async () => {
  await store.loadAll()
  await loadSyncData()
  if (syncError.value === 'need_password' || syncError.value === 'wrong_password') {
    showPasswordModal.value = true
    if (syncError.value === 'wrong_password') {
      passwordError.value = '密碼錯誤，請重新輸入'
    }
  }
})

async function submitPassword() {
  if (!passwordInput.value) return
  passwordError.value = ''
  setSyncPassword(passwordInput.value)
  await loadSyncData()
  if (syncError.value === 'wrong_password') {
    passwordError.value = '密碼錯誤，請重新輸入'
  } else {
    showPasswordModal.value = false
  }
}
</script>

<template>
  <AppLayout />

  <!-- 密碼輸入 Modal -->
  <Teleport to="body">
    <div v-if="showPasswordModal" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div class="bg-surface w-80 rounded-2xl p-6">
        <div class="flex items-center gap-2 mb-4">
          <Lock :size="20" class="text-primary" />
          <h2 class="text-lg font-bold">輸入同步密碼</h2>
        </div>
        <p class="text-sm text-text-secondary mb-4">首次使用需輸入密碼以解密資料</p>
        <input
          v-model="passwordInput"
          type="password"
          placeholder="密碼"
          class="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
          @keyup.enter="submitPassword"
        />
        <p v-if="passwordError" class="text-xs text-liability mt-2">{{ passwordError }}</p>
        <button
          @click="submitPassword"
          class="w-full mt-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
        >
          確認
        </button>
      </div>
    </div>
  </Teleport>
</template>
