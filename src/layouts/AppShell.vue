<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useAlertStore } from '@/stores/alerts'

interface NavItem {
  path: string
  label: string
  permission: string
  hideForMember?: boolean
}

interface NavGroup {
  label: string
  code: string
  items: NavItem[]
}

const session = useSessionStore()
const alerts = useAlertStore()
const route = useRoute()
const router = useRouter()
const nightMode = ref(localStorage.getItem('finance-theme') === 'dark')
let alertTimer: ReturnType<typeof setInterval> | undefined
const navGroups: NavGroup[] = [
  {
    label: '期货管理',
    code: 'FUTURES',
    items: [
      { path: 'overview', label: '运行概览', permission: 'overview:page' },
      { path: 'instruments', label: '品种管理', permission: 'instrument:page' },
      { path: 'subscriptions', label: '订阅品种', permission: 'dominant:page' },
      { path: 'monitor', label: '实时监控', permission: 'market:page' },
      { path: 'strategies', label: '策略配置', permission: 'strategy:page' },
      { path: 'signals', label: '信号告警', permission: 'signal:page' },
    ],
  },
  {
    label: '用户管理',
    code: 'ACCESS',
    items: [
      { path: 'users', label: '用户列表', permission: 'user:page', hideForMember: true },
      { path: 'permissions', label: '权限配置', permission: 'permission:page' },
      { path: 'messages', label: '消息中心', permission: 'signal:page' },
    ],
  },
  {
    label: '系统管理',
    code: 'SYSTEM',
    items: [
      { path: 'scheduler', label: '调度中心', permission: 'scheduler:page' },
      { path: 'issues', label: '系统问题', permission: 'issue:page' },
      { path: 'settings', label: '系统设置', permission: 'setting:page' },
    ],
  },
]

const visibleGroups = computed(() =>
  navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          session.can(item.permission) && !(item.hideForMember && session.user?.role === 'MEMBER'),
      ),
    }))
    .filter((group) => group.items.length > 0),
)

const currentLocation = computed(() => {
  const page = route.path.split('/')[1]
  for (const group of navGroups) {
    const item = group.items.find((entry) => entry.path === page)
    if (item) return { group: group.label, page: item.label }
  }
  return { group: '工作台', page: '金融云' }
})

watch(
  nightMode,
  (enabled) => {
    const theme = enabled ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('finance-theme', theme)
  },
  { immediate: true },
)

async function refreshAlerts() {
  if (!session.user || !session.can('signal:page')) return
  alerts.initialize(session.user.id)
  try {
    await alerts.refresh()
  } catch {
    /* 下次轮询重试，不打断当前页面。 */
  }
}

onMounted(() => {
  refreshAlerts()
  alertTimer = setInterval(refreshAlerts, 10_000)
})
onBeforeUnmount(() => {
  if (alertTimer) clearInterval(alertTimer)
})

async function logout() {
  try {
    await session.logout()
  } finally {
    await router.push('/login')
  }
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">FC</span>
        <div><strong>金融云</strong><small>FUTURES INTELLIGENCE</small></div>
      </div>
      <nav class="side-nav" aria-label="主导航">
        <section v-for="group in visibleGroups" :key="group.code" class="nav-group">
          <div class="nav-group-title">
            <span>{{ group.label }}</span
            ><small>{{ group.code }}</small>
          </div>
          <div class="nav-children">
            <router-link v-for="item in group.items" :key="item.path" :to="`/${item.path}`">
              {{ item.label }}
              <span v-if="item.path === 'messages' && alerts.unreadCount" class="message-count">{{
                alerts.unreadCount
              }}</span>
            </router-link>
          </div>
        </section>
      </nav>
      <div class="system-state"><i></i><span>当前会话已验证</span></div>
    </aside>
    <main>
      <header>
        <div>
          <small>金融云 / {{ currentLocation.group }} / {{ currentLocation.page }}</small>
          <h1>{{ currentLocation.page }}</h1>
        </div>
        <div class="account-area">
          <label class="theme-setting">
            <span>夜间模式</span>
            <el-switch v-model="nightMode" aria-label="切换夜间模式" />
          </label>
          <label class="theme-setting">
            <span>语音告警</span>
            <el-switch
              :model-value="alerts.voiceEnabled"
              aria-label="切换语音告警"
              @change="alerts.setVoice(Boolean($event))"
            />
          </label>
          <span class="account-avatar">{{
            session.user?.username?.slice(0, 1).toUpperCase()
          }}</span>
          <span>{{ session.user?.username }}</span>
          <el-button link @click="logout">退出</el-button>
        </div>
      </header>
      <router-view />
    </main>
  </div>
</template>
