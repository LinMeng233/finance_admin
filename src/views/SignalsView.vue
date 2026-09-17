<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { formatDateTime } from '@/utils/dateTime'
import { displayCode, displayNumber, displayTimeframe } from '@/utils/display'
import { contractChineseLabel, contractShortCode } from '@/utils/contract'
import { useSessionStore } from '@/stores/session'
import { useAlertStore } from '@/stores/alerts'
import { useRouter } from 'vue-router'
import { signalAnnouncement } from '@/utils/signalAlert'

interface Signal {
  id: string
  strategyId: string
  configVersion: number
  strategyName: string
  productCode: string
  contract: string
  timeframe: string
  barStart: string
  signalType: string
  closePrice: string
  indicators: Record<string, string | number>
  sourcePhase: string
  deliveryState: string
  status: string
  createdAt: string
}
interface Statistics {
  todayCount: number
  liveCount: number
  historyCount: number
  sentNotificationCount: number
  pendingNotificationCount: number
  failedNotificationCount: number
}
const rows = ref<Signal[]>([])
const selectedSignal = ref<Signal | null>(null)
const router = useRouter()
const total = ref(0)
const statistics = ref<Statistics>({
  todayCount: 0,
  liveCount: 0,
  historyCount: 0,
  sentNotificationCount: 0,
  pendingNotificationCount: 0,
  failedNotificationCount: 0,
})
const session = useSessionStore()
const alertStore = useAlertStore()
const refreshSeconds = ref(0)
const stale = ref(false)
const query = reactive({
  productCode: '',
  contract: '',
  timeframe: '',
  sourcePhase: '',
  status: '',
  pageNo: 1,
  pageSize: 20,
})
let timer: number | undefined
async function load() {
  try {
    const [list, stats] = await Promise.all([
      api.get<ApiResult<{ total: number; records: Signal[] }>>('/signal/listSignals', {
        params: {
          productCode: query.productCode || undefined,
          contract: query.contract || undefined,
          timeframe: query.timeframe || undefined,
          sourcePhase: query.sourcePhase || undefined,
          status: query.status || undefined,
          pageNo: query.pageNo,
          pageSize: query.pageSize,
        },
      }),
      api.get<ApiResult<Statistics>>('/signal/getSignalStatistics'),
    ])
    rows.value = list.data.data.records
    total.value = list.data.data.total
    statistics.value = stats.data.data
    stale.value = false
  } catch {
    stale.value = true
    ElMessage.warning('刷新失败，当前显示上一次成功结果')
  }
}
function schedule(value: number) {
  if (timer) window.clearInterval(timer)
  timer = value ? window.setInterval(load, value * 1000) : undefined
}
async function clearSignals() {
  await ElMessageBox.confirm('将当前时间以前的告警全部软删除，历史审计仍保留。', '清空告警', {
    type: 'warning',
  })
  await api.post('/signal/clearSignals', { before: new Date().toISOString() })
  ElMessage.success('告警已清空')
  await load()
}
function locate(signal: Signal) {
  void router.push({
    path: `/subscriptions/${encodeURIComponent(signal.contract)}`,
    query: { timeframe: signal.timeframe, barStart: signal.barStart },
  })
}
onMounted(load)
onBeforeUnmount(() => timer && window.clearInterval(timer))
</script>
<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">TRACEABLE SIGNALS</span>
        <h2>信号告警</h2>
        <p>每条记录关联策略版本、触发 K 线和通知状态。</p>
      </div>
      <div>
        <el-tag v-if="stale" type="warning">数据可能已过期</el-tag>
        <el-select
          v-model="refreshSeconds"
          style="width: 130px; margin-left: 12px"
          @change="schedule"
        >
          <el-option label="关闭刷新" :value="0" />
          <el-option label="10 秒刷新" :value="10" />
          <el-option label="30 秒刷新" :value="30" />
          <el-option label="60 秒刷新" :value="60" />
        </el-select>
        <el-button v-if="session.can('signal:clear')" class="danger-action" @click="clearSignals"
          >清空</el-button
        >
      </div>
    </div>
    <div class="mini-metrics">
      <span
        >今日 <b>{{ statistics.todayCount }}</b></span
      ><span
        >实时 <b>{{ statistics.liveCount }}</b></span
      ><span
        >历史 <b>{{ statistics.historyCount }}</b></span
      ><span
        >推送成功 <b>{{ statistics.sentNotificationCount }}</b></span
      ><span
        >异常通知 <b>{{ statistics.failedNotificationCount }}</b></span
      >
    </div>
    <el-form inline class="filters"
      ><el-form-item label="品种"><el-input v-model="query.productCode" clearable /></el-form-item
      ><el-form-item label="合约"><el-input v-model="query.contract" clearable /></el-form-item
      ><el-form-item label="周期"
        ><el-select v-model="query.timeframe" clearable style="width: 110px"
          ><el-option
            v-for="i in ['1min', '5min', '15min', '30min', '1h', 'D']"
            :key="i"
            :label="displayTimeframe(i)"
            :value="i" /></el-select></el-form-item
      ><el-form-item label="来源"
        ><el-select v-model="query.sourcePhase" clearable style="width: 130px"
          ><el-option
            v-for="i in ['LIVE', 'RECOVERY', 'HISTORY', 'REVISION']"
            :key="i"
            :label="displayCode(i)"
            :value="i" /></el-select></el-form-item
      ><el-button @click="load">查询</el-button></el-form
    >
    <el-table :data="rows">
      <el-table-column label="触发时间" min-width="180">
        <template #default="s">{{ formatDateTime(s.row.barStart) }}</template>
      </el-table-column>
      <el-table-column prop="strategyName" label="策略" />
      <el-table-column label="合约" min-width="150">
        <template #default="s">
          {{
            contractChineseLabel(
              alertStore.productNames[s.row.productCode] || s.row.productCode,
              s.row.contract,
            )
          }}
          <small>{{ contractShortCode(s.row.contract) }}</small>
        </template>
      </el-table-column>
      <el-table-column label="周期">
        <template #default="s">{{ displayTimeframe(s.row.timeframe) }}</template>
      </el-table-column>
      <el-table-column label="告警内容" min-width="250">
        <template #default="s">
          <span>{{ signalAnnouncement(s.row, alertStore.productNames[s.row.productCode]) }}</span>
          <el-button link type="primary" @click="alertStore.replay(s.row)">播放</el-button>
          <el-button link type="primary" @click="selectedSignal = s.row">详情</el-button>
        </template>
      </el-table-column>
      <el-table-column label="价格"
        ><template #default="s">{{ displayNumber(s.row.closePrice) }}</template></el-table-column
      >
      <el-table-column label="来源">
        <template #default="s">{{ displayCode(s.row.sourcePhase) }}</template>
      </el-table-column>
      <el-table-column label="通知">
        <template #default="s">{{ displayCode(s.row.deliveryState) }}</template>
      </el-table-column>
      <el-table-column label="有效性">
        <template #default="s">{{ displayCode(s.row.status) }}</template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="query.pageNo"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="load"
    />
    <el-dialog
      :model-value="selectedSignal !== null"
      title="告警解释"
      width="560px"
      @close="selectedSignal = null"
    >
      <template v-if="selectedSignal">
        <p>策略：{{ selectedSignal.strategyName }}（版本 v{{ selectedSignal.configVersion }}）</p>
        <p>信号：{{ displayCode(selectedSignal.signalType) }}</p>
        <p>
          合约：{{ selectedSignal.contract }} · {{ displayTimeframe(selectedSignal.timeframe) }}
        </p>
        <p>
          触发 K 线：{{ formatDateTime(selectedSignal.barStart) }}，收盘价
          {{ selectedSignal.closePrice }}
        </p>
        <p>计算时的指标：</p>
        <el-descriptions :column="1" border>
          <el-descriptions-item
            v-for="(value, key) in selectedSignal.indicators"
            :key="key"
            :label="key"
            >{{ value }}</el-descriptions-item
          >
        </el-descriptions>
        <el-button type="primary" style="margin-top: 16px" @click="locate(selectedSignal)"
          >在 K 线图定位</el-button
        >
      </template>
    </el-dialog>
  </section>
</template>
