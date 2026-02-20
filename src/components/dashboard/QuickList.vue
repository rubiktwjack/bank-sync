<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAssetStore } from '../../stores/assets'
import { formatCurrency, maskAccountNumber, timeAgo } from '../../utils/format'
import { Landmark, Globe, CreditCard as CreditCardIcon, Home, ChevronDown } from 'lucide-vue-next'

const store = useAssetStore()

interface QuickItem {
  id: string
  icon: typeof Landmark
  title: string
  subtitle: string
  amount: string
  amountClass: string
  updatedAt: Date
}

const groupedByBank = computed(() => {
  const items: QuickItem[] = []

  for (const d of store.deposits) {
    items.push({
      id: d.id,
      icon: Landmark,
      title: `${d.accountType === 'savings' ? '活儲' : d.accountType === 'checking' ? '活存' : '定存'} ${maskAccountNumber(d.accountNumber)}`,
      subtitle: timeAgo(d.lastUpdated),
      amount: formatCurrency(d.balance),
      amountClass: 'text-asset',
      updatedAt: d.lastUpdated,
    })
  }

  for (const f of store.foreignDeposits) {
    items.push({
      id: f.id,
      icon: Globe,
      title: `${f.currency} ${maskAccountNumber(f.accountNumber)}`,
      subtitle: `≈ ${formatCurrency(f.twdEquivalent)}`,
      amount: formatCurrency(f.balance, f.currency),
      amountClass: 'text-asset',
      updatedAt: f.lastUpdated,
    })
  }

  for (const c of store.creditCards) {
    items.push({
      id: c.id,
      icon: CreditCardIcon,
      title: `${c.cardName} ****${c.cardNumber.slice(-4)}`,
      subtitle: timeAgo(c.lastUpdated),
      amount: `-${formatCurrency(c.currentBalance)}`,
      amountClass: 'text-liability',
      updatedAt: c.lastUpdated,
    })
  }

  for (const l of store.loans) {
    items.push({
      id: l.id,
      icon: Home,
      title: l.loanType === 'mortgage' ? '房貸' : l.loanType === 'car' ? '車貸' : l.loanType === 'personal' ? '信貸' : l.loanType === 'student' ? '學貸' : '其他貸款',
      subtitle: timeAgo(l.lastUpdated),
      amount: `-${formatCurrency(l.remainingBalance)}`,
      amountClass: 'text-liability',
      updatedAt: l.lastUpdated,
    })
  }

  // 按銀行名稱分組
  const banks = new Map<string, QuickItem[]>()
  const allAccounts = [
    ...store.deposits.map((d) => ({ bankName: d.bankName, id: d.id })),
    ...store.foreignDeposits.map((f) => ({ bankName: f.bankName, id: f.id })),
    ...store.creditCards.map((c) => ({ bankName: c.bankName, id: c.id })),
    ...store.loans.map((l) => ({ bankName: l.bankName, id: l.id })),
  ]

  for (const acc of allAccounts) {
    if (!banks.has(acc.bankName)) banks.set(acc.bankName, [])
    const item = items.find((i) => i.id === acc.id)
    if (item) banks.get(acc.bankName)!.push(item)
  }

  return Array.from(banks.entries()).map(([bankName, bankItems]) => ({
    bankName,
    items: bankItems,
  }))
})

const expanded = ref<Set<string>>(new Set())

function toggle(bankName: string) {
  if (expanded.value.has(bankName)) {
    expanded.value.delete(bankName)
  } else {
    expanded.value.add(bankName)
  }
}
</script>

<template>
  <div class="bg-surface rounded-2xl p-4">
    <h3 class="text-sm font-semibold text-text-secondary mb-3">最近更新</h3>
    <div v-if="groupedByBank.length > 0" class="space-y-2">
      <div v-for="group in groupedByBank" :key="group.bankName">
        <!-- 銀行標題（可摺疊） -->
        <button
          @click="toggle(group.bankName)"
          class="flex items-center justify-between w-full py-2 text-left"
        >
          <span class="text-sm font-semibold">{{ group.bankName }}</span>
          <div class="flex items-center gap-2">
            <span class="text-xs text-text-secondary">{{ group.items.length }} 筆</span>
            <ChevronDown
              :size="16"
              class="text-text-secondary transition-transform duration-200"
              :class="{ 'rotate-180': expanded.has(group.bankName) }"
            />
          </div>
        </button>
        <!-- 帳戶列表 -->
        <div v-show="expanded.has(group.bankName)" class="space-y-2 pl-1">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="flex items-center gap-3"
          >
            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <component :is="item.icon" :size="16" class="text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ item.title }}</p>
              <p class="text-xs text-text-secondary">{{ item.subtitle }}</p>
            </div>
            <p class="text-sm font-semibold shrink-0" :class="item.amountClass">{{ item.amount }}</p>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-6 text-text-secondary text-sm">
      尚無帳戶資料
    </div>
  </div>
</template>
