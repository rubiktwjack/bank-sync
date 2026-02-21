<script setup lang="ts">
import { ref, computed } from 'vue'
import TopBar from '../components/layout/TopBar.vue'
import { useAssetStore } from '../stores/assets'
import { formatCurrency, maskAccountNumber, timeAgo } from '../utils/format'
import { Plus, Landmark, Globe, Bitcoin, Package, Trash2, ChevronDown, AlertTriangle } from 'lucide-vue-next'
import { bankErrors } from '../composables/useSync'

const store = useAssetStore()

type TabType = 'deposit' | 'foreign' | 'crypto' | 'custom'
const activeTab = ref<TabType>('deposit')

// 按銀行分組台幣存款
const depositsByBank = computed(() => {
  const banks = new Map<string, typeof store.deposits>()
  for (const d of store.deposits) {
    if (!banks.has(d.bankName)) banks.set(d.bankName, [])
    banks.get(d.bankName)!.push(d)
  }
  return Array.from(banks.entries()).map(([bankName, items]) => ({
    bankName,
    items,
    total: items.reduce((s, d) => s + d.balance, 0),
  }))
})

// 交易所名單（排除加密貨幣，只顯示銀行外幣）
const EXCHANGES = ['BingX', 'Binance', 'Bybit']

// 按銀行分組外幣存款（排除交易所）
const foreignByBank = computed(() => {
  const banks = new Map<string, typeof store.foreignDeposits>()
  for (const f of store.foreignDeposits) {
    if (EXCHANGES.includes(f.bankName)) continue
    if (!banks.has(f.bankName)) banks.set(f.bankName, [])
    banks.get(f.bankName)!.push(f)
  }
  return Array.from(banks.entries()).map(([bankName, items]) => ({
    bankName,
    items,
    totalTWD: items.reduce((s, f) => s + (f.twdEquivalent || 0), 0),
  }))
})

// 按交易所分組加密貨幣（即使沒有資產也顯示已連接的交易所）
const cryptoByExchange = computed(() => {
  const exchanges = new Map<string, typeof store.foreignDeposits>()
  // 先把所有已知交易所初始化為空陣列
  for (const name of EXCHANGES) exchanges.set(name, [])
  for (const f of store.foreignDeposits) {
    if (!EXCHANGES.includes(f.bankName)) continue
    exchanges.get(f.bankName)!.push(f)
  }
  return Array.from(exchanges.entries()).map(([name, items]) => ({
    bankName: name,
    items: items.sort((a, b) => (b.twdEquivalent || 0) - (a.twdEquivalent || 0)),
    totalTWD: items.reduce((s, f) => s + (f.twdEquivalent || 0), 0),
  }))
})

// 摺疊狀態
const expanded = ref<Set<string>>(new Set())
function toggle(bankName: string) {
  if (expanded.value.has(bankName)) {
    expanded.value.delete(bankName)
  } else {
    expanded.value.add(bankName)
  }
}

// Add custom asset form
const showCustomForm = ref(false)
const customForm = ref({
  name: '',
  subCategory: '',
  value: 0,
  currency: 'TWD',
  notes: '',
})

async function saveCustomAsset() {
  if (!customForm.value.name) return
  await store.addCustomAsset({
    name: customForm.value.name,
    category: 'asset',
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
    <TopBar title="資產">
      <template #actions>
        <button v-if="activeTab === 'custom'" @click="showCustomForm = true" class="w-9 h-9 flex items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus :size="20" />
        </button>
      </template>
    </TopBar>

    <!-- Asset total -->
    <div class="px-4 pt-4 pb-2">
      <p class="text-sm text-text-secondary">總資產</p>
      <p class="text-2xl font-bold text-asset">{{ formatCurrency(store.totalAssets) }}</p>
    </div>

    <!-- Tabs -->
    <div class="flex px-4 gap-2 mb-4">
      <button
        v-for="tab in ([
          { key: 'deposit', label: '台幣', icon: Landmark },
          { key: 'foreign', label: '外幣', icon: Globe },
          { key: 'crypto', label: '加密', icon: Bitcoin },
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

    <!-- Deposit list (grouped by bank) -->
    <div v-if="activeTab === 'deposit'" class="px-4 space-y-3">
      <div
        v-for="group in depositsByBank"
        :key="group.bankName"
        class="bg-surface rounded-2xl overflow-hidden"
      >
        <!-- Bank header -->
        <button
          @click="toggle('d-' + group.bankName)"
          class="flex items-center justify-between w-full px-4 py-3 cursor-pointer"
        >
          <div class="flex items-center gap-2">
            <Landmark :size="16" class="text-primary" />
            <span class="font-semibold text-sm">{{ group.bankName }}</span>
            <span class="text-xs text-text-secondary">{{ group.items.length }} 筆</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-asset">{{ formatCurrency(group.total) }}</span>
            <ChevronDown
              :size="16"
              class="text-text-secondary transition-transform duration-200"
              :class="{ 'rotate-180': expanded.has('d-' + group.bankName) }"
            />
          </div>
        </button>
        <!-- Accounts -->
        <div v-show="expanded.has('d-' + group.bankName)" class="border-t border-border">
          <div
            v-for="d in group.items"
            :key="d.id"
            class="px-4 py-3 border-b border-border last:border-b-0"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  {{ d.accountType === 'savings' ? '活儲' : d.accountType === 'checking' ? '活存' : '定存' }}
                  {{ maskAccountNumber(d.accountNumber) }}
                </p>
                <div class="flex gap-3 mt-0.5 text-xs text-text-secondary">
                  <span v-if="d.interestRate">利率 {{ d.interestRate }}%</span>
                  <span>{{ timeAgo(d.lastUpdated) }}</span>
                </div>
              </div>
              <p class="text-base font-bold text-asset">{{ formatCurrency(d.balance) }}</p>
            </div>
          </div>
        </div>
      </div>
      <div v-if="store.deposits.length === 0" class="text-center py-12 text-text-secondary text-sm">
        資料自動從銀行同步，若無資料請至「更多」執行立即同步
      </div>
    </div>

    <!-- Foreign deposit list (grouped by bank) -->
    <div v-if="activeTab === 'foreign'" class="px-4 space-y-3">
      <div
        v-for="group in foreignByBank"
        :key="group.bankName"
        class="bg-surface rounded-2xl overflow-hidden"
      >
        <!-- Bank header -->
        <button
          @click="toggle('f-' + group.bankName)"
          class="flex items-center justify-between w-full px-4 py-3 cursor-pointer"
        >
          <div class="flex items-center gap-2">
            <Globe :size="16" class="text-primary" />
            <span class="font-semibold text-sm">{{ group.bankName }}</span>
            <span class="text-xs text-text-secondary">{{ group.items.length }} 筆</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-asset">≈ {{ formatCurrency(group.totalTWD) }}</span>
            <ChevronDown
              :size="16"
              class="text-text-secondary transition-transform duration-200"
              :class="{ 'rotate-180': expanded.has('f-' + group.bankName) }"
            />
          </div>
        </button>
        <!-- Accounts -->
        <div v-show="expanded.has('f-' + group.bankName)" class="border-t border-border">
          <div
            v-for="f in group.items"
            :key="f.id"
            class="px-4 py-3 border-b border-border last:border-b-0"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  <span class="text-primary">{{ f.currency }}</span>
                  <span v-if="f.accountNumber">{{ maskAccountNumber(f.accountNumber) }}</span>
                </p>
                <p class="text-xs text-text-secondary mt-0.5">
                  ≈ {{ formatCurrency(f.twdEquivalent) }} · 匯率 {{ f.exchangeRate?.toFixed(2) }}
                </p>
              </div>
              <p class="text-base font-bold text-asset">{{ formatCurrency(f.balance, f.currency) }}</p>
            </div>
          </div>
        </div>
      </div>
      <div v-if="foreignByBank.length === 0" class="text-center py-12 text-text-secondary text-sm">
        資料自動從銀行同步，若無資料請至「更多」執行立即同步
      </div>
    </div>

    <!-- Crypto list (grouped by exchange) -->
    <div v-if="activeTab === 'crypto'" class="px-4 space-y-3">
      <div
        v-for="group in cryptoByExchange"
        :key="group.bankName"
        class="bg-surface rounded-2xl overflow-hidden"
      >
        <button
          @click="toggle('c-' + group.bankName)"
          class="flex items-center justify-between w-full px-4 py-3 cursor-pointer"
        >
          <div class="flex items-center gap-2">
            <Bitcoin :size="16" class="text-primary" />
            <span class="font-semibold text-sm">{{ group.bankName }}</span>
            <span class="text-xs text-text-secondary">{{ group.items.length }} 幣種</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-asset">≈ {{ formatCurrency(group.totalTWD) }}</span>
            <ChevronDown
              :size="16"
              class="text-text-secondary transition-transform duration-200"
              :class="{ 'rotate-180': expanded.has('c-' + group.bankName) }"
            />
          </div>
        </button>
        <div v-show="expanded.has('c-' + group.bankName)" class="border-t border-border">
          <!-- API 錯誤提醒 -->
          <div v-if="bankErrors[group.bankName]" class="px-4 py-3 bg-liability/10 flex items-start gap-2">
            <AlertTriangle :size="16" class="text-liability shrink-0 mt-0.5" />
            <p class="text-xs text-liability">API 金鑰可能已過期，請更新後重新同步</p>
          </div>
          <!-- 無資產提示 -->
          <div v-else-if="group.items.length === 0" class="px-4 py-3 text-xs text-text-secondary">
            目前無持倉（或資產價值低於 NT$1）
          </div>
          <div
            v-for="f in group.items"
            :key="f.id"
            class="px-4 py-3 border-b border-border last:border-b-0"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-primary">{{ f.currency }}</p>
                <p class="text-xs text-text-secondary mt-0.5">
                  ≈ {{ formatCurrency(f.twdEquivalent) }} · 單價 {{ formatCurrency(f.exchangeRate || 0) }}
                </p>
              </div>
              <p class="text-base font-bold text-asset">{{ f.balance >= 1 ? f.balance.toFixed(2) : f.balance.toFixed(6) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom asset list -->
    <div v-if="activeTab === 'custom'" class="px-4 space-y-3">
      <div
        v-for="a in store.customAssets.filter(a => a.category === 'asset')"
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
        <p class="text-xl font-bold text-asset mt-2">{{ formatCurrency(a.value, a.currency) }}</p>
        <p v-if="a.notes" class="text-xs text-text-secondary mt-1">{{ a.notes }}</p>
      </div>
      <div v-if="store.customAssets.filter(a => a.category === 'asset').length === 0" class="text-center py-12 text-text-secondary text-sm">
        點右上角 + 新增自訂資產
      </div>
    </div>

    <!-- Add Custom Asset Modal -->
    <Teleport to="body">
      <div v-if="showCustomForm" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" @click.self="showCustomForm = false">
        <div class="bg-surface w-full max-w-lg rounded-t-2xl p-5 pb-safe animate-slide-up">
          <h2 class="text-lg font-bold mb-4">新增自訂資產</h2>
          <div class="space-y-3">
            <div>
              <label class="text-sm text-text-secondary">名稱</label>
              <input v-model="customForm.name" type="text" placeholder="例：台積電股票" class="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div>
              <label class="text-sm text-text-secondary">分類 (選填)</label>
              <input v-model="customForm.subCategory" type="text" placeholder="例：股票、基金、不動產" class="w-full mt-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
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
            <button @click="saveCustomAsset" class="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">儲存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
