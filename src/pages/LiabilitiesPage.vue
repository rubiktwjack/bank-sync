<script setup lang="ts">
import { ref } from 'vue'
import TopBar from '../components/layout/TopBar.vue'
import { useAssetStore } from '../stores/assets'
import { formatCurrency, formatDate } from '../utils/format'
import { Plus, CreditCard as CreditCardIcon, Package, Trash2 } from 'lucide-vue-next'

const store = useAssetStore()

type TabType = 'credit' | 'custom'
const activeTab = ref<TabType>('credit')

// Custom liability form
const showCustomForm = ref(false)
const customForm = ref({
  name: '',
  subCategory: '',
  value: 0,
  currency: 'TWD',
  notes: '',
})

async function saveCustomLiability() {
  if (!customForm.value.name) return
  await store.addCustomAsset({
    name: customForm.value.name,
    category: 'liability',
    subCategory: customForm.value.subCategory,
    value: customForm.value.value,
    currency: customForm.value.currency,
    notes: customForm.value.notes || undefined,
  })
  customForm.value = { name: '', subCategory: '', value: 0, currency: 'TWD', notes: '' }
  showCustomForm.value = false
}
</script>

<template>
  <div>
    <TopBar title="負債">
      <template #actions>
        <button v-if="activeTab === 'custom'" @click="showCustomForm = true" class="w-9 h-9 flex items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus :size="20" />
        </button>
      </template>
    </TopBar>

    <div class="px-4 pt-4 pb-2">
      <p class="text-sm text-text-secondary">總負債</p>
      <p class="text-2xl font-bold text-liability">{{ formatCurrency(store.totalLiabilities) }}</p>
    </div>

    <!-- Tabs -->
    <div class="flex px-4 gap-2 mb-4">
      <button
        v-for="tab in ([
          { key: 'credit', label: '信用卡', icon: CreditCardIcon },
          { key: 'custom', label: '自訂', icon: Package },
        ] as const)"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors"
        :class="activeTab === tab.key ? 'bg-primary text-white' : 'bg-surface text-text-secondary'"
      >
        <component :is="tab.icon" :size="14" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Credit Card list -->
    <div v-if="activeTab === 'credit'" class="px-4 space-y-3">
      <div
        v-for="c in store.creditCards"
        :key="c.id"
        class="bg-surface rounded-2xl p-4"
      >
        <div>
          <p class="font-semibold">{{ c.bankName }} {{ c.cardName }}</p>
          <p v-if="c.cardNumber" class="text-sm text-text-secondary">**** {{ c.cardNumber }}</p>
        </div>
        <div class="mt-2">
          <div class="flex justify-between text-sm">
            <span class="text-text-secondary">本期應繳</span>
            <span class="font-bold text-liability">{{ formatCurrency(c.currentBalance) }}</span>
          </div>
        </div>
        <div class="flex gap-4 mt-3 text-xs text-text-secondary">
          <span>繳款日 {{ formatDate(c.dueDate) }}</span>
          <span>額度 {{ formatCurrency(c.creditLimit) }}</span>
        </div>
      </div>
      <div v-if="store.creditCards.length === 0" class="text-center py-12 text-text-secondary text-sm">
        資料自動從銀行同步，若無資料請至「更多」執行立即同步
      </div>
    </div>

    <!-- Custom liability list -->
    <div v-if="activeTab === 'custom'" class="px-4 space-y-3">
      <div
        v-for="a in store.customAssets.filter(a => a.category === 'liability')"
        :key="a.id"
        class="bg-surface rounded-2xl p-4"
      >
        <div class="flex items-start justify-between">
          <div>
            <p class="font-semibold">{{ a.name }}</p>
            <p v-if="a.subCategory" class="text-sm text-text-secondary">{{ a.subCategory }}</p>
          </div>
          <button @click="store.deleteCustomAsset(a.id)" class="text-text-secondary p-1">
            <Trash2 :size="16" />
          </button>
        </div>
        <p class="text-xl font-bold text-liability mt-2">{{ formatCurrency(a.value, a.currency) }}</p>
        <p v-if="a.notes" class="text-xs text-text-secondary mt-1">{{ a.notes }}</p>
      </div>
      <div v-if="store.customAssets.filter(a => a.category === 'liability').length === 0" class="text-center py-12 text-text-secondary text-sm">
        點右上角 + 新增自訂負債
      </div>
    </div>

    <!-- Add Custom Liability Modal -->
    <Teleport to="body">
      <div v-if="showCustomForm" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" @click.self="showCustomForm = false">
        <div class="bg-surface w-full max-w-lg rounded-t-2xl p-5 pb-safe animate-slide-up">
          <h2 class="text-lg font-bold mb-4">新增自訂負債</h2>
          <div class="space-y-3">
            <div>
              <label class="text-sm text-text-secondary">名稱</label>
              <input v-model="customForm.name" type="text" placeholder="例：親友借款" class="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label class="text-sm text-text-secondary">分類 (選填)</label>
              <input v-model="customForm.subCategory" type="text" placeholder="例：房貸、信貸、借款" class="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label class="text-sm text-text-secondary">金額</label>
              <input v-model.number="customForm.value" type="number" placeholder="0" class="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label class="text-sm text-text-secondary">備註 (選填)</label>
              <input v-model="customForm.notes" type="text" placeholder="備註" class="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
          </div>
          <div class="flex gap-3 mt-5">
            <button @click="showCustomForm = false" class="flex-1 py-2.5 rounded-xl border border-border text-sm">取消</button>
            <button @click="saveCustomLiability" class="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">儲存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
