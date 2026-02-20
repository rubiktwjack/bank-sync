<script setup lang="ts">
import { LayoutDashboard, Wallet, CreditCard, MoreHorizontal } from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { name: 'dashboard', label: '總覽', icon: LayoutDashboard, path: '/' },
  { name: 'assets', label: '資產', icon: Wallet, path: '/assets' },
  { name: 'liabilities', label: '負債', icon: CreditCard, path: '/liabilities' },
  { name: 'more', label: '更多', icon: MoreHorizontal, path: '/more' },
]

function isActive(tab: (typeof tabs)[0]) {
  if (tab.path === '/') return route.path === '/'
  return route.path.startsWith(tab.path)
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 bg-surface border-t border-border pb-safe z-50">
    <div class="flex justify-around items-center h-16 max-w-lg mx-auto">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="tab.path"
        class="flex flex-col items-center justify-center flex-1 py-2 transition-colors"
        :class="isActive(tab) ? 'text-primary' : 'text-text-secondary'"
      >
        <component :is="tab.icon" :size="22" :stroke-width="isActive(tab) ? 2.5 : 1.5" />
        <span class="text-xs mt-0.5" :class="isActive(tab) ? 'font-semibold' : ''">{{ tab.label }}</span>
      </router-link>
    </div>
  </nav>
</template>
