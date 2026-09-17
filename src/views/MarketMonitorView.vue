<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { contractShortCode } from '@/utils/contract'
import { displayNumber } from '@/utils/display'

interface Bar {
  openPrice: string
  highPrice: string
  lowPrice: string
  closePrice: string
  volume: string
}
interface Signal {
  signalType: string
}
interface Quote {
  fields: Record<string, string>
}
interface Row {
  productName: string
  contract: string
  bar?: Bar
  quote?: Quote
  buyCount: number | null
  sellCount: number | null
}
const rows = ref<Row[]>([])
const loading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | undefined

function field(row: Row, key: string, fallback?: string): string {
  return displayNumber(row.quote?.fields[key] ?? fallback)
}

function positionChange(row: Row): string {
  const current = Number(row.quote?.fields.open_interest)
  const previous = Number(row.quote?.fields.pre_open_interest)
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return '—'
  const difference = current - previous
  return `${difference > 0 ? '+' : ''}${displayNumber(String(difference))}`
}

async function signalCounts(contract: string) {
  let pageNo = 1
  let buyCount = 0
  let sellCount = 0
  while (true) {
    const response = await api.get<ApiResult<{ total: number; records: Signal[] }>>(
      '/signal/listSignals',
      { params: { contract, status: 'ACTIVE', pageNo, pageSize: 100 } },
    )
    const { total, records } = response.data.data
    for (const signal of records) {
      if (signal.signalType.endsWith('_UP')) buyCount++
      if (signal.signalType.endsWith('_DOWN')) sellCount++
    }
    if (pageNo * 100 >= total || records.length === 0) break
    pageNo++
  }
  return { buyCount, sellCount }
}

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const [subscriptions, catalog] = await Promise.all([
      api.get<ApiResult<{ targetType: string; targetCode: string }[]>>('/market/listSubscriptions'),
      api.get<
        ApiResult<{
          instruments: {
            productCode: string
            productName: string
            dominantContract: string | null
          }[]
        }>
      >('/market/listInstruments', { params: { pageNo: 1, pageSize: 100 } }),
    ])
    const products = new Map(catalog.data.data.instruments.map((item) => [item.productCode, item]))
    const contracts = new Set<string>()
    for (const item of subscriptions.data.data) {
      const contract =
        item.targetType === 'PRODUCT'
          ? products.get(item.targetCode)?.dominantContract
          : item.targetCode
      if (contract) contracts.add(contract)
    }
    rows.value = await Promise.all(
      [...contracts].map(async (contract): Promise<Row> => {
        const productCode = contractShortCode(contract).match(/^[A-Za-z]+/)?.[0] ?? ''
        const row: Row = {
          productName: products.get(productCode)?.productName ?? productCode,
          contract: contractShortCode(contract),
          buyCount: null,
          sellCount: null,
        }
        const [barResult, quoteResult, signalResult] = await Promise.allSettled([
          api.get<ApiResult<Bar[]>>('/market/getRecentBars', {
            params: { contract, timeframe: '1min', limit: 1 },
          }),
          api.get<ApiResult<Quote | null>>('/market/getContractQuote', {
            params: { contract },
          }),
          signalCounts(contract),
        ])
        if (barResult.status === 'fulfilled') row.bar = barResult.value.data.data.at(-1)
        if (quoteResult.status === 'fulfilled') row.quote = quoteResult.value.data.data ?? undefined
        if (signalResult.status === 'fulfilled') {
          row.buyCount = signalResult.value.buyCount
          row.sellCount = signalResult.value.sellCount
        }
        return row
      }),
    )
    if (rows.value.some((row) => row.buyCount === null)) ElMessage.warning('部分策略信号加载失败')
  } catch {
    ElMessage.error('实时监控加载失败')
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  void load()
  refreshTimer = setInterval(() => {
    if (!document.hidden) void load()
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
        <span class="eyebrow">MARKET MONITOR</span>
        <h2>实时监控</h2>
        <p>订阅合约行情每 10 秒更新；暂无行情快照时显示最新已收盘分钟线。</p>
      </div>
      <el-button type="primary" :loading="loading" @click="load">刷新</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" max-height="620" empty-text="暂无订阅合约">
      <el-table-column prop="productName" label="品种" min-width="100" />
      <el-table-column prop="contract" label="合约编号" min-width="120" />
      <el-table-column label="目前价格" min-width="110"
        ><template #default="s">{{
          field(s.row, 'last_price', s.row.bar?.closePrice)
        }}</template></el-table-column
      >
      <el-table-column label="开盘价格" min-width="110"
        ><template #default="s">{{
          field(s.row, 'open', s.row.bar?.openPrice)
        }}</template></el-table-column
      >
      <el-table-column label="最高价格" min-width="110"
        ><template #default="s">{{
          field(s.row, 'highest', s.row.bar?.highPrice)
        }}</template></el-table-column
      >
      <el-table-column label="最低价格" min-width="110"
        ><template #default="s">{{
          field(s.row, 'lowest', s.row.bar?.lowPrice)
        }}</template></el-table-column
      >
      <el-table-column label="成交量" min-width="100"
        ><template #default="s">{{
          field(s.row, 'volume', s.row.bar?.volume)
        }}</template></el-table-column
      >
      <el-table-column label="增减仓数" min-width="110"
        ><template #default="s">{{ positionChange(s.row) }}</template></el-table-column
      >
      <el-table-column label="策略产生买点数" min-width="140"
        ><template #default="s">{{ s.row.buyCount ?? '—' }}</template></el-table-column
      >
      <el-table-column label="策略产生卖点数" min-width="140"
        ><template #default="s">{{ s.row.sellCount ?? '—' }}</template></el-table-column
      >
    </el-table>
  </section>
</template>
