<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type ApiResult } from '@/api/client'
import { formatDateTime } from '@/utils/dateTime'
import { displayCode } from '@/utils/display'

interface Overview {
  activeStrategies: number
  todayBars: number
  todaySignals: number
  pendingJobs: number
  activeSubscriptions: number
  liveCollectors: number
  sentNotifications: number
  failedNotifications: number
  openIssues: number
}
interface HealthCheck {
  checkKey: string
  checkName: string
  status: string
  reason: string
}
interface SelfCheck {
  checkedAt: string
  overallStatus: string
  checks: HealthCheck[]
}

const overview = ref<Overview | null>(null)
const selfCheck = ref<SelfCheck | null>(null)
const error = ref(false)
const metrics = computed(() => [
  ['活跃策略', overview.value?.activeStrategies ?? '—', '当前启用'],
  ['今日已收 K 线', overview.value?.todayBars ?? '—', '按北京时间'],
  ['今日信号', overview.value?.todaySignals ?? '—', '按北京时间'],
  ['待处理任务', overview.value?.pendingJobs ?? '—', '包含重试与租约中'],
  ['活跃订阅', overview.value?.activeSubscriptions ?? '—', '品种和具体合约'],
  ['在线采集器', overview.value?.liveCollectors ?? '—', '30 秒内有心跳'],
  ['待处理问题', overview.value?.openIssues ?? '—', '运行异常聚合'],
  [
    '通知成功率',
    overview.value && overview.value.sentNotifications + overview.value.failedNotifications > 0
      ? `${Math.round((overview.value.sentNotifications * 100) / (overview.value.sentNotifications + overview.value.failedNotifications))}%`
      : '—',
    '已确认投递结果',
  ],
])

onMounted(async () => {
  try {
    const overviewResponse = await api.get<ApiResult<Overview>>('/ops/getOverview')
    overview.value = overviewResponse.data.data
  } catch {
    error.value = true
  }
  try {
    const checkResponse = await api.post<ApiResult<SelfCheck>>('/ops/runSelfCheck')
    selfCheck.value = checkResponse.data.data
  } catch {
    return
  }
})
</script>
<template>
  <section class="content">
    <div class="hero">
      <div>
        <span class="eyebrow">SYSTEM PULSE</span>
        <h2>今日运行概览</h2>
        <p>实时读取已入库的行情、策略、信号、通知与计算任务。</p>
      </div>
      <span class="live-pill"
        ><i></i>{{ error ? '概览暂不可用' : overview ? '数据已同步' : '读取中' }}</span
      >
    </div>
    <div class="metric-grid">
      <article v-for="metric in metrics" :key="metric[0]">
        <small>{{ metric[0] }}</small
        ><strong>{{ metric[1] }}</strong
        ><span>{{ metric[2] }}</span>
      </article>
    </div>
    <div class="panel-grid">
      <article class="panel">
        <h3>链路健康</h3>
        <div class="empty-ring">{{ displayCode(selfCheck?.overallStatus) }}</div>
        <p>
          {{ selfCheck ? `检查于 ${formatDateTime(selfCheck.checkedAt)}` : '正在执行系统自检' }}
        </p>
      </article>
      <article class="panel wide">
        <h3>自检明细</h3>
        <el-table v-if="selfCheck" :data="selfCheck.checks" size="small">
          <el-table-column prop="checkName" label="检查项" width="130" />
          <el-table-column label="状态" width="100"
            ><template #default="s">{{ displayCode(s.row.status) }}</template></el-table-column
          >
          <el-table-column prop="reason" label="结果" />
        </el-table>
        <div v-else class="empty-state">自检数据读取中</div>
      </article>
    </div>
  </section>
</template>
