<script setup lang="ts">
import TopBar from '../components/layout/TopBar.vue'
import NetWorthCard from '../components/dashboard/NetWorthCard.vue'
import AssetDistribution from '../components/dashboard/AssetDistribution.vue'
import QuickList from '../components/dashboard/QuickList.vue'
</script>

<template>
  <div>
    <TopBar title="Rex 資產總覽" />
    <div class="px-4 py-4 space-y-4 flex-1">
      <NetWorthCard />
      <AssetDistribution />
      <QuickList />
    </div>
  </div>
</template>
