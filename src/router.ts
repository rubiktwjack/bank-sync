import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/bank-sync/'),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('./pages/DashboardPage.vue'),
    },
    {
      path: '/assets',
      name: 'assets',
      component: () => import('./pages/AssetsPage.vue'),
    },
    {
      path: '/liabilities',
      name: 'liabilities',
      component: () => import('./pages/LiabilitiesPage.vue'),
    },
    {
      path: '/more',
      name: 'more',
      component: () => import('./pages/MorePage.vue'),
    },
  ],
})

export default router
