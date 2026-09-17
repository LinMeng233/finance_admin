<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { contractChineseLabel, contractShortCode } from '@/utils/contract'
import { displayTimeframe } from '@/utils/display'
import { useRouter } from 'vue-router'

interface Dominant {
  productCode: string
  productName: string
  exchangeCode: string
  exchangeName: string
  contractCode?: string
  status: string
}
interface Subscription {
  targetType: 'PRODUCT' | 'CONTRACT'
  targetCode: string
  symbol: string
  timeframes: string[]
  initializedContract?: string | null
}
interface Instrument {
  productCode: string
  productName: string
  exchangeCode: string
  exchangeName: string
}
interface DisplayRow {
  key: string
  targetType: 'PRODUCT' | 'CONTRACT'
  targetCode: string
  productCode: string
  productName: string
  exchangeCode: string
  exchangeName: string
  contractCode?: string
  status: string
  initializedContract?: string | null
  timeframes: string[]
}

const loading = ref(false)
const router = useRouter()
const dominantRows = ref<Dominant[]>([])
const subscriptions = ref<Subscription[]>([])
const instruments = ref<Instrument[]>([])
const collectors = ref<{ collectorId: string; state: string }[]>([])
let refreshTimer: ReturnType<typeof setInterval> | undefined
const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ productCode: '', contractCode: '' })

const subscribedProducts = computed(() =>
  dominantRows.value.map((item) => ({
    label: `${item.productName} ${item.productCode} · ${item.exchangeName}`,
    value: item.productCode,
  })),
)

function contractProductCode(contract: string) {
  return contract.split('.')[1]?.match(/^[A-Za-z]+/)?.[0] ?? ''
}

const rows = computed<DisplayRow[]>(() => {
  const mainRows: DisplayRow[] = dominantRows.value.map((item) => ({
    key: `PRODUCT:${item.productCode}`,
    targetType: 'PRODUCT',
    targetCode: item.productCode,
    productCode: item.productCode,
    productName: item.productName,
    exchangeCode: item.exchangeCode,
    exchangeName: item.exchangeName,
    contractCode: item.contractCode,
    status: item.status,
    initializedContract: subscriptions.value.find(
      (subscription) =>
        subscription.targetType === 'PRODUCT' && subscription.targetCode === item.productCode,
    )?.initializedContract,
    timeframes:
      subscriptions.value.find(
        (subscription) =>
          subscription.targetType === 'PRODUCT' && subscription.targetCode === item.productCode,
      )?.timeframes ?? [],
  }))
  const contractRows: DisplayRow[] = subscriptions.value
    .filter((item) => item.targetType === 'CONTRACT')
    .map((item) => {
      const productCode = contractProductCode(item.targetCode)
      const instrument = instruments.value.find(
        (candidate) =>
          candidate.productCode.toLowerCase() === productCode.toLowerCase() &&
          item.targetCode.startsWith(`${candidate.exchangeCode}.`),
      )
      return {
        key: `CONTRACT:${item.targetCode}`,
        targetType: 'CONTRACT',
        targetCode: item.targetCode,
        productCode: instrument?.productCode ?? productCode,
        productName: instrument?.productName ?? '指定合约',
        exchangeCode: instrument?.exchangeCode ?? item.targetCode.split('.')[0],
        exchangeName: instrument?.exchangeName ?? '未知交易所',
        contractCode: item.targetCode,
        status: 'ACTIVE',
        initializedContract: item.initializedContract,
        timeframes: item.timeframes,
      }
    })
  return [...mainRows, ...contractRows]
})

async function load() {
  loading.value = true
  try {
    const [dominant, subscription, instrument, collector] = await Promise.all([
      api.get<ApiResult<Dominant[]>>('/market/listDominantContracts'),
      api.get<ApiResult<Subscription[]>>('/market/listSubscriptions'),
      api.get<ApiResult<{ instruments: Instrument[] }>>('/market/listInstruments', {
        params: { pageNo: 1, pageSize: 100 },
      }),
      api.get<ApiResult<{ collectorId: string; state: string }[]>>('/market/listCollectors'),
    ])
    dominantRows.value = dominant.data.data
    subscriptions.value = subscription.data.data
    instruments.value = instrument.data.data.instruments
    collectors.value = collector.data.data
  } catch {
    ElMessage.error('订阅信息加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

function openContractDialog() {
  if (dominantRows.value.length === 0) {
    ElMessage.warning('请先在品种管理中订阅一个品种')
    return
  }
  form.productCode = dominantRows.value[0].productCode
  form.contractCode = ''
  dialogVisible.value = true
}

function normalizedContract() {
  const product = dominantRows.value.find((item) => item.productCode === form.productCode)
  if (!product) return ''
  const input = form.contractCode.trim()
  return input.includes('.') ? input : `${product.exchangeCode}.${input}`
}

async function addContract() {
  const product = dominantRows.value.find((item) => item.productCode === form.productCode)
  const contract = normalizedContract()
  if (!product || !contract.match(/^[A-Z]+\.[A-Za-z]+[0-9]{3,4}$/)) {
    ElMessage.warning('请输入正确的合约代码，例如 jm2605')
    return
  }
  if (
    !contract.startsWith(`${product.exchangeCode}.`) ||
    contractProductCode(contract).toLowerCase() !== product.productCode.toLowerCase()
  ) {
    ElMessage.warning(
      `合约必须属于${product.productName}（${product.exchangeCode}.${product.productCode}）`,
    )
    return
  }
  if (contract === product.contractCode) {
    ElMessage.warning('该合约已通过主力跟随订阅，无需重复添加')
    return
  }
  saving.value = true
  try {
    await api.post('/market/updateSubscription', {
      targetType: 'CONTRACT',
      targetCode: contract,
      subscribed: true,
    })
    ElMessage.success('非主力合约已加入订阅')
    dialogVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function removeSubscription(row: DisplayRow) {
  await api.post('/market/updateSubscription', {
    targetType: row.targetType,
    targetCode: row.targetCode,
    subscribed: false,
  })
  ElMessage.success(row.targetType === 'PRODUCT' ? '已取消主力跟随' : '已移除指定合约')
  await load()
}

function displayStatus(row: DisplayRow) {
  if (!row.contractCode || row.initializedContract !== row.contractCode) return '初始化中'
  return collectors.value.some((collector) => collector.state === 'LIVE') ? '实时' : '已中断'
}

onMounted(() => {
  load()
  refreshTimer = setInterval(() => {
    if (!document.hidden) load()
  }, 10_000)
})
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">MARKET SUBSCRIPTIONS</span>
        <h2>订阅品种</h2>
        <p>品种订阅自动跟随当前主力；需要采集非主力时，可单独添加指定合约。</p>
      </div>
      <div class="page-actions">
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="openContractDialog">添加非主力合约</el-button>
      </div>
    </div>

    <div v-if="collectors.length === 0" class="status-callout">
      暂无采集器心跳。订阅已保存，主力映射会在行情采集器连接后自动刷新。
    </div>

    <el-table v-loading="loading" :data="rows" empty-text="暂无订阅，请先到品种管理选择品种">
      <el-table-column label="订阅方式" width="120">
        <template #default="scope">
          <el-tag :type="scope.row.targetType === 'PRODUCT' ? 'warning' : 'info'">
            {{ scope.row.targetType === 'PRODUCT' ? '主力跟随' : '指定合约' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="订阅合约" min-width="230">
        <template #default="scope">
          <el-button
            v-if="scope.row.contractCode"
            link
            type="primary"
            class="contract-link"
            @click="router.push(`/subscriptions/${encodeURIComponent(scope.row.contractCode)}`)"
            >{{ contractChineseLabel(scope.row.productName, scope.row.contractCode) }} ↗</el-button
          >
          <strong v-else>{{ scope.row.productName }} · 主力待刷新</strong>
          <small class="contract-code">{{
            scope.row.contractCode
              ? contractShortCode(scope.row.contractCode)
              : scope.row.productCode
          }}</small>
        </template>
      </el-table-column>
      <el-table-column label="交易所" min-width="210">
        <template #default="scope">
          <span>{{ scope.row.exchangeName }}</span>
          <small class="exchange-code">{{ scope.row.exchangeCode }}</small>
        </template>
      </el-table-column>
      <el-table-column label="K 线周期" min-width="130">
        <template #default="scope">{{
          scope.row.timeframes.map(displayTimeframe).join('、') || '1 分钟'
        }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="scope">
          <el-tag :type="displayStatus(scope.row) === '实时' ? 'success' : 'warning'">
            {{ displayStatus(scope.row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="scope">
          <el-button link type="danger" @click="removeSubscription(scope.row)">取消订阅</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>

  <el-dialog v-model="dialogVisible" title="添加非主力合约" width="480px">
    <el-form label-position="top" @submit.prevent="addContract">
      <el-form-item label="所属订阅品种" required>
        <el-select v-model="form.productCode" style="width: 100%">
          <el-option
            v-for="item in subscribedProducts"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="合约代码" required>
        <el-input v-model="form.contractCode" placeholder="例如 jm2605，也可输入 DCE.jm2605" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="addContract">确认订阅</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.page-actions {
  display: flex;
  gap: 10px;
}

.status-callout {
  margin: 12px 0 18px;
  padding: 12px 14px;
  border-left: 3px solid var(--orange);
  color: var(--el-text-color-regular);
  background: color-mix(in srgb, var(--orange) 8%, transparent);
  font-size: 13px;
}

.exchange-code {
  margin-left: 7px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  letter-spacing: 0.04em;
}
.contract-link {
  font-weight: 700;
  letter-spacing: 0.02em;
}
.contract-code {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
</style>
