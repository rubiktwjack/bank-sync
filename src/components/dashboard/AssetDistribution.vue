<script setup lang="ts">
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { useAssetStore } from '../../stores/assets'

ChartJS.register(ArcElement, Tooltip, Legend)

const store = useAssetStore()

const chartData = computed(() => {
  const segments = []
  const colors = []
  const labels = []

  if (store.totalDeposits > 0) {
    segments.push(store.totalDeposits)
    colors.push('#22C55E')
    labels.push('台幣存款')
  }
  if (store.totalForeignTWD > 0) {
    segments.push(store.totalForeignTWD)
    colors.push('#8B5CF6')
    labels.push('外幣存款')
  }
  if (store.totalCryptoTWD > 0) {
    segments.push(store.totalCryptoTWD)
    colors.push('#F97316')
    labels.push('加密貨幣')
  }
  if (store.totalStocks > 0) {
    segments.push(store.totalStocks)
    colors.push('#06B6D4')
    labels.push('股票')
  }
  if (store.totalCustomAssets > 0) {
    segments.push(store.totalCustomAssets)
    colors.push('#F59E0B')
    labels.push('自訂資產')
  }
  if (store.totalCreditCardDebt > 0) {
    segments.push(store.totalCreditCardDebt)
    colors.push('#3B82F6')
    labels.push('信用卡')
  }
  if (store.totalLoanBalance > 0) {
    segments.push(store.totalLoanBalance)
    colors.push('#EF4444')
    labels.push('貸款')
  }

  return {
    labels,
    datasets: [
      {
        data: segments,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        usePointStyle: true,
        padding: 16,
        font: { size: 12 },
        color: '#9CA3AF',
      },
    },
  },
}

const hasData = computed(() =>
  store.totalAssets > 0 || store.totalLiabilities > 0
)
</script>

<template>
  <div class="bg-surface rounded-2xl p-4">
    <h3 class="text-sm font-semibold text-text-secondary mb-3">資產分佈</h3>
    <div v-if="hasData" class="flex justify-center">
      <div class="w-56 h-56">
        <Doughnut :data="chartData" :options="chartOptions" />
      </div>
    </div>
    <div v-else class="text-center py-8 text-text-secondary text-sm">
      尚無資料，從「資產」或「負債」頁面新增
    </div>
  </div>
</template>
