import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '@/views/LoginView.vue'
import AppShell from '@/layouts/AppShell.vue'
import { useSessionStore } from '@/stores/session'

const routePermission: Record<string, string> = {
  overview: 'overview:page',
  instruments: 'instrument:page',
  subscriptions: 'dominant:page',
  dominant: 'dominant:page',
  monitor: 'market:page',
  strategies: 'strategy:page',
  signals: 'signal:page',
  scheduler: 'scheduler:page',
  issues: 'issue:page',
  settings: 'setting:page',
  users: 'user:page',
  permissions: 'permission:page',
  messages: 'signal:page',
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: '/overview' },
        { path: 'change-password', component: () => import('@/views/ChangePasswordView.vue') },
        { path: 'users', component: () => import('@/views/UsersView.vue') },
        { path: 'forbidden', component: () => import('@/views/ForbiddenView.vue') },
        { path: 'overview', component: () => import('@/views/DashboardView.vue') },
        { path: 'instruments', component: () => import('@/views/InstrumentsView.vue') },
        { path: 'subscriptions', component: () => import('@/views/DominantView.vue') },
        {
          path: 'subscriptions/:contract',
          component: () => import('@/views/ContractDetailView.vue'),
        },
        { path: 'dominant', redirect: '/subscriptions' },
        { path: 'monitor', component: () => import('@/views/MarketMonitorView.vue') },
        { path: 'strategies', component: () => import('@/views/StrategiesView.vue') },
        { path: 'signals', component: () => import('@/views/SignalsView.vue') },
        { path: 'permissions', component: () => import('@/views/PermissionsView.vue') },
        { path: 'messages', component: () => import('@/views/MessagesView.vue') },
        { path: 'scheduler', component: () => import('@/views/SchedulerView.vue') },
        { path: 'issues', component: () => import('@/views/IssuesView.vue') },
        { path: 'settings', component: () => import('@/views/SettingsView.vue') },
        { path: ':pathMatch(.*)*', component: () => import('@/views/NotFoundView.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.path === '/login') return
  if (!sessionStorage.getItem('accessToken')) return '/login'
  if (!session.user) {
    try {
      await session.restore()
    } catch {
      session.clear()
      return '/login'
    }
  }
  if (session.user?.mustChangePassword && to.path !== '/change-password') return '/change-password'
  const page = to.path.split('/')[1]
  if (page === 'users' && session.user?.role === 'MEMBER') return '/forbidden'
  const permission = routePermission[page]
  if (permission && !session.can(permission)) return '/forbidden'
})
