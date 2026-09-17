<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { api, type ApiResult } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { contractChineseLabel, contractShortCode } from '@/utils/contract'
import { formatDateTime } from '@/utils/dateTime'
import { displayTimeframe } from '@/utils/display'
import { signalTypeLabel } from '@/utils/signalAlert'

interface Bar {
  barStart: string
  tradingDay: string
  openPrice: string
  highPrice: string
  lowPrice: string
  closePrice: string
  volume: string
}
interface Quote {
  contractCode: string
  quoteTime: string
  fields: Record<string, string>
}
interface Strategy {
  id: string
  name: string
  status: string
  actualContract?: string
  targetMode: string
  parameters: { productCodes?: string[] }
  timeframe: string
  signalType: string
  allowBackfill: boolean
}
interface ChartSignal {
  id: string
  status: string
  strategyName: string
  configVersion: number
  timeframe: string
  barStart: string
  signalType: string
  closePrice: string
}
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const contract = computed(() => String(route.params.contract || ''))
const shortCode = computed(() => contractShortCode(contract.value))
const instrument = ref<{
  productCode: string
  productName: string
  exchangeCode: string
  exchangeName: string
} | null>(null)
const displayName = computed(() =>
  instrument.value
    ? contractChineseLabel(instrument.value.productName, contract.value)
    : contract.value,
)
const timeframe = ref(
  typeof route.query.timeframe === 'string' &&
    ['1min', '3min', '5min', '10min', '15min', '30min', '1h', '2h', 'D'].includes(
      route.query.timeframe,
    )
    ? route.query.timeframe
    : '1min',
)
const bars = ref<Bar[]>([])
const dailyBars = ref<Bar[]>([])
const quote = ref<Quote | null>(null)
const strategies = ref<Strategy[]>([])
const signals = ref<ChartSignal[]>([])
const loading = ref(false)
const backfilling = ref<string | null>(null)
const chartEl = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null
let timer: ReturnType<typeof setInterval> | null = null
let observer: ResizeObserver | null = null
let marketRequest = 0
const periods = [
  ['1min', '1 分钟'],
  ['3min', '3 分钟'],
  ['5min', '5 分钟'],
  ['10min', '10 分钟'],
  ['15min', '15 分钟'],
  ['30min', '30 分钟'],
  ['1h', '60 分钟'],
  ['2h', '120 分钟'],
  ['D', '日线'],
]
const market = computed(() => quote.value?.fields ?? {})
const lastPrice = computed(
  () => number(market.value.last_price) ?? number(bars.value.at(-1)?.closePrice),
)
const previous = computed(
  () => number(market.value.pre_close) ?? number(market.value.pre_settlement),
)
const priceChange = computed(() =>
  lastPrice.value != null && previous.value != null && previous.value !== 0
    ? ((lastPrice.value - previous.value) / previous.value) * 100
    : null,
)
const currentStrategies = computed(() =>
  strategies.value.filter(
    (item) =>
      item.actualContract === contract.value ||
      (item.targetMode === 'WATCHLIST' &&
        instrument.value?.productCode &&
        item.parameters.productCodes?.includes(instrument.value.productCode)),
  ),
)
const dailyCloses = computed(() => dailyBars.value.map((bar) => Number(bar.closePrice)))
const averages = computed(() =>
  [5, 20, 60].map((days) => {
    const values = movingAverage(dailyCloses.value, days)
    return { days, value: values.at(-1) ?? null }
  }),
)

function number(value?: string): number | null {
  if (value == null || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}
function display(value?: string, digits = 2): string {
  const parsed = number(value)
  return parsed == null ? '—' : parsed.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}
function ema(values: number[], period: number) {
  const result: number[] = []
  const weight = 2 / (period + 1)
  values.forEach((value, index) =>
    result.push(index ? value * weight + result[index - 1] * (1 - weight) : value),
  )
  return result
}
function movingAverage(values: number[], period: number): (number | null)[] {
  let sum = 0
  return values.map((value, index) => {
    sum += value
    if (index >= period) sum -= values[index - period]
    return index >= period - 1 ? Number((sum / period).toFixed(4)) : null
  })
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ||
      character,
  )
}
async function loadSignals(currentBars: Bar[], currentContract: string, currentTimeframe: string) {
  if (!session.can('signal:read') || !currentBars.length) return []
  const sorted = [...currentBars].sort((a, b) => Date.parse(a.barStart) - Date.parse(b.barStart))
  const records: ChartSignal[] = []
  let pageNo = 1
  let total = 0
  do {
    const response = await api.get<ApiResult<{ total: number; records: ChartSignal[] }>>(
      '/signal/listSignals',
      {
        params: {
          contract: currentContract,
          // The signal API only accepts calculation timeframes, not every display timeframe.
          timeframe: ['1min', '5min', '15min', '30min', '1h', 'D'].includes(currentTimeframe)
            ? currentTimeframe
            : undefined,
          startedAt: sorted[0].barStart,
          endedAt: sorted.at(-1)?.barStart,
          pageNo,
          pageSize: 100,
        },
      },
    )
    total = response.data.data.total
    records.push(...response.data.data.records)
    if (!response.data.data.records.length) break
    pageNo++
  } while (records.length < total)
  return records.filter((item) => item.status === 'ACTIVE' && item.timeframe === currentTimeframe)
}
function renderChart() {
  if (!chartEl.value) return
  chart ??= echarts.init(chartEl.value)
  const entries = bars.value.filter((bar) =>
    ['openPrice', 'highPrice', 'lowPrice', 'closePrice', 'volume'].every(
      (key) => number(bar[key as keyof Bar]) != null,
    ),
  )
  const labels = entries.map((bar) => formatDateTime(bar.barStart))
  const signalsByBar = new Map<string, ChartSignal[]>()
  for (const signal of signals.value) {
    const key = formatDateTime(signal.barStart)
    signalsByBar.set(key, [...(signalsByBar.get(key) ?? []), signal])
  }
  const signalPoints = (direction: 'UP' | 'DOWN') =>
    entries.flatMap((bar, index) => {
      const matches = (signalsByBar.get(labels[index]) ?? []).filter((signal) =>
        signal.signalType.endsWith(`_${direction}`),
      )
      const range = Math.max(
        Number(bar.highPrice) - Number(bar.lowPrice),
        Number(bar.closePrice) * 0.001,
      )
      return matches.map((signal, offset) => ({
        value: [
          labels[index],
          direction === 'UP'
            ? Number(bar.lowPrice) - range * (0.18 + offset * 0.18)
            : Number(bar.highPrice) + range * (0.18 + offset * 0.18),
        ],
        signal,
      }))
    })
  const buyPoints = signalPoints('UP')
  const sellPoints = signalPoints('DOWN')
  const closes = entries.map((bar) => Number(bar.closePrice))
  const fast = ema(closes, 12),
    slow = ema(closes, 26)
  const dif = fast.map((value, index) => value - slow[index])
  const dea = ema(dif, 9)
  const histogram = dif.map((value, index) => (value - dea[index]) * 2)
  const upward = '#f28a3b',
    downward = '#348b79'
  chart.setOption(
    {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: { color: '#8d949e' },
      legend: {
        data: ['K 线', '买点', '卖点', 'MA5', 'MA20', 'MA60', '成交量', 'DIF', 'DEA', 'MACD'],
        top: 5,
        right: 12,
        textStyle: { color: '#9ba3ad' },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: '#20242a',
        borderColor: '#ed8c40',
        textStyle: { color: '#f5f5f5' },
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const index = Number((params[0] as { dataIndex: number }).dataIndex)
          const bar = entries[index]
          if (!bar) return ''
          return [
            labels[index],
            `开盘：${bar.openPrice}`,
            `最高：${bar.highPrice}`,
            `最低：${bar.lowPrice}`,
            `收盘：${bar.closePrice}`,
            `成交量：${bar.volume}`,
            `MACD：${histogram[index].toFixed(4)}`,
            `DIF：${dif[index].toFixed(4)}`,
            `DEA：${dea[index].toFixed(4)}`,
            ...(signalsByBar.get(labels[index]) ?? []).map(
              (signal) =>
                `${signal.signalType.endsWith('_UP') ? '买点' : '卖点'}：${escapeHtml(signal.strategyName)} v${signal.configVersion} · ${escapeHtml(signalTypeLabel(signal.signalType))} · ${escapeHtml(signal.closePrice)}`,
            ),
          ].join('<br/>')
        },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 58, right: 20, top: 42, height: '49%' },
        { left: 58, right: 20, top: '62%', height: '13%' },
        { left: 58, right: 20, top: '81%', height: '13%' },
      ],
      xAxis: [0, 1, 2].map((index) => ({
        type: 'category',
        data: labels,
        gridIndex: index,
        boundaryGap: true,
        axisLabel: { show: index === 2, color: '#8d949e' },
        axisLine: { lineStyle: { color: '#59616b' } },
        axisTick: { show: false },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      })),
      yAxis: [0, 1, 2].map((index) => ({
        type: 'value',
        gridIndex: index,
        scale: true,
        splitNumber: index === 0 ? 5 : 2,
        axisLabel: { color: '#8d949e', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(125,135,145,.16)' } },
      })),
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1, 2],
          start: focusedZoomStart(entries),
          end: focusedZoomEnd(entries),
        },
        {
          type: 'slider',
          xAxisIndex: [0, 1, 2],
          bottom: 0,
          height: 14,
          borderColor: 'transparent',
          fillerColor: 'rgba(242,138,59,.16)',
        },
      ],
      series: [
        {
          name: 'K 线',
          type: 'candlestick',
          data: entries.map((bar) => [
            Number(bar.openPrice),
            Number(bar.closePrice),
            Number(bar.lowPrice),
            Number(bar.highPrice),
          ]),
          itemStyle: {
            color: upward,
            color0: downward,
            borderColor: upward,
            borderColor0: downward,
          },
          markPoint: {
            symbol: 'pin',
            symbolSize: 46,
            itemStyle: { color: '#efc15f' },
            data:
              focusedIndex(entries) < 0
                ? []
                : [
                    {
                      name: '定位',
                      coord: [
                        labels[focusedIndex(entries)],
                        Number(entries[focusedIndex(entries)].highPrice),
                      ],
                      value: '定位',
                    },
                  ],
          },
        },
        ...(
          [
            ['买点', buyPoints, upward, 0],
            ['卖点', sellPoints, downward, 180],
          ] as const
        ).map(([name, data, color, rotate]) => ({
          name,
          type: 'scatter' as const,
          data,
          symbol: 'triangle',
          symbolRotate: rotate,
          symbolSize: 17,
          itemStyle: { color, borderColor: '#fff', borderWidth: 1 },
          label: {
            show: true,
            formatter: name === '买点' ? '买' : '卖',
            position: name === '买点' ? 'bottom' : 'top',
            color,
            fontWeight: 'bold' as const,
            fontSize: 11,
          },
          z: 10,
        })),
        ...(
          [
            [5, '#e05a5a'],
            [20, '#e9c349'],
            [60, '#4e9ce0'],
          ] as const
        ).map(([period, color]) => ({
          name: `MA${period}`,
          type: 'line' as const,
          data: movingAverage(closes, period),
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.8, color },
          itemStyle: { color },
          connectNulls: false,
        })),
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: entries.map((bar) => ({
            value: Number(bar.volume),
            itemStyle: {
              color: Number(bar.closePrice) >= Number(bar.openPrice) ? upward : downward,
            },
          })),
        },
        {
          name: 'MACD',
          type: 'bar',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: histogram.map((value) => ({
            value: value.toFixed(4),
            itemStyle: { color: value >= 0 ? upward : downward },
          })),
        },
        {
          name: 'DIF',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.5, color: '#f6c16e' },
          data: dif.map((value) => value.toFixed(4)),
        },
        {
          name: 'DEA',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.5, color: '#76a9db' },
          data: dea.map((value) => value.toFixed(4)),
        },
      ],
    },
    true,
  )
}
function focusedIndex(entries: Bar[]) {
  const target = typeof route.query.barStart === 'string' ? route.query.barStart : ''
  return target ? entries.findIndex((bar) => bar.barStart === target) : -1
}
function focusedZoomStart(entries: Bar[]) {
  const index = focusedIndex(entries)
  return index < 0 ? 55 : Math.max(0, ((index - 12) / entries.length) * 100)
}
function focusedZoomEnd(entries: Bar[]) {
  const index = focusedIndex(entries)
  return index < 0 ? 100 : Math.min(100, ((index + 13) / entries.length) * 100)
}
async function loadMarket() {
  if (!/^[A-Z]+\.[A-Za-z]+\d{3,4}$/.test(contract.value)) return
  const request = ++marketRequest
  const requestedContract = contract.value
  const requestedTimeframe = timeframe.value
  loading.value = true
  try {
    const [barResponse, quoteResponse, dailyResponse] = await Promise.all([
      api.get<ApiResult<Bar[]>>('/market/getRecentBars', {
        params: {
          contract: contract.value,
          timeframe: timeframe.value,
          limit: timeframe.value === '1min' ? 2880 : 300,
        },
      }),
      api.get<ApiResult<Quote | null>>('/market/getContractQuote', {
        params: { contract: contract.value },
      }),
      timeframe.value === 'D'
        ? Promise.resolve(null)
        : api.get<ApiResult<Bar[]>>('/market/getRecentBars', {
            params: { contract: contract.value, timeframe: 'D', limit: 60 },
          }),
    ])
    const receivedBars = barResponse.data.data
    if (request !== marketRequest) return
    if (timeframe.value === '1min') {
      const days = [...new Set(receivedBars.map((bar) => bar.tradingDay))].slice(-2)
      bars.value = receivedBars.filter((bar) => days.includes(bar.tradingDay))
    } else {
      bars.value = receivedBars
    }
    dailyBars.value = timeframe.value === 'D' ? bars.value : (dailyResponse?.data.data ?? [])
    quote.value = quoteResponse.data.data
    let receivedSignals: ChartSignal[] = []
    try {
      receivedSignals = await loadSignals(bars.value, requestedContract, requestedTimeframe)
    } catch {
      // Market data remains usable if signal history is temporarily unavailable.
    }
    if (request !== marketRequest) return
    signals.value = receivedSignals
    if (route.query.barStart && focusedIndex(bars.value) < 0) {
      ElMessage.warning('目标 K 线已超出当前行情保留范围')
    }
    await nextTick()
    renderChart()
  } catch {
    ElMessage.error('行情读取失败，请检查采集器状态')
  } finally {
    loading.value = false
  }
}
async function loadStrategies() {
  if (!session.can('strategy:page')) return
  try {
    const response = await api.get<ApiResult<{ records: Strategy[] }>>('/strategy/listStrategies', {
      params: { pageNo: 1, pageSize: 100 },
    })
    strategies.value = response.data.data.records
  } catch {
    strategies.value = []
  }
}
async function loadInstrument() {
  const exchangeCode = contract.value.split('.')[0]
  const productCode = shortCode.value.match(/^[A-Za-z]+/)?.[0]
  if (!productCode) return
  try {
    const response = await api.get<
      ApiResult<{ instruments: Array<NonNullable<typeof instrument.value>> }>
    >('/market/listInstruments', {
      params: { keyword: productCode, pageNo: 1, pageSize: 100 },
    })
    instrument.value =
      response.data.data.instruments.find(
        (item) => item.productCode === productCode && item.exchangeCode === exchangeCode,
      ) ?? null
  } catch {
    instrument.value = null
  }
}
async function backfill(strategy: Strategy) {
  await ElMessageBox.confirm(
    strategy.targetMode === 'WATCHLIST'
      ? `将回溯“${strategy.name}”列表内所有在交易合约，各合约最近 300 根 K 线，继续吗？`
      : `按最近 300 根 K 线回溯“${strategy.name}”吗？`,
    '策略回溯',
  )
  backfilling.value = strategy.id
  try {
    const response = await api.post<ApiResult<{ queuedBars: number }>>(
      `/strategy/${strategy.id}/backfill`,
    )
    ElMessage.success(`已提交 ${response.data.data.queuedBars} 根 K 线计算任务`)
    await loadMarket()
  } finally {
    backfilling.value = null
  }
}
onMounted(() => {
  loadMarket()
  loadInstrument()
  loadStrategies()
  timer = setInterval(() => {
    if (!document.hidden) loadMarket()
  }, 10_000)
  if (chartEl.value) {
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(chartEl.value)
  }
})
watch([contract, timeframe], loadMarket)
watch(() => route.query.barStart, renderChart)
watch(contract, loadInstrument)
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <section class="contract-detail">
    <div class="detail-head">
      <div>
        <el-button text @click="router.push('/subscriptions')">← 订阅品种</el-button>
        <span class="eyebrow">CONTRACT TERMINAL / 合约详情</span>
        <h2>
          {{ displayName }}
          <small class="detail-code">{{ shortCode }}</small>
          <small class="detail-exchange">{{
            instrument?.exchangeName || contract.split('.')[0]
          }}</small>
        </h2>
        <p>天勤行情快照 · 每 10 秒更新 · 策略历史回溯</p>
      </div>
      <el-button type="primary" :loading="loading" @click="loadMarket">刷新行情</el-button>
    </div>

    <div class="quote-hero">
      <div class="price-block">
        <span class="field-label">最新价</span>
        <strong :class="priceChange != null && priceChange < 0 ? 'fall' : 'rise'">{{
          lastPrice == null ? '—' : display(String(lastPrice))
        }}</strong>
        <span
          class="price-change"
          :class="priceChange != null && priceChange < 0 ? 'fall' : 'rise'"
        >
          {{
            priceChange == null
              ? '暂无涨跌幅'
              : `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`
          }}
        </span>
        <small>{{ quote?.quoteTime ? formatDateTime(quote.quoteTime) : '等待天勤行情' }}</small>
      </div>
      <div class="metric-grid">
        <div
          v-for="metric in [
            ['今开', 'open'],
            ['最高', 'highest'],
            ['最低', 'lowest'],
            ['昨收', 'pre_close'],
            ['当日成交量', 'volume'],
            ['持仓量', 'open_interest'],
            ['昨持仓', 'pre_open_interest'],
            ['成交额', 'amount'],
            ['买一价', 'bid_price1'],
            ['买一量', 'bid_volume1'],
            ['卖一价', 'ask_price1'],
            ['卖一量', 'ask_volume1'],
            ['均价', 'average'],
            ['结算价', 'settlement'],
            ['涨停价', 'upper_limit'],
            ['跌停价', 'lower_limit'],
          ]"
          :key="metric[1]"
          class="metric"
        >
          <span>{{ metric[0] }}</span
          ><b>{{
            display(
              market[metric[1]],
              [
                'volume',
                'open_interest',
                'pre_open_interest',
                'bid_volume1',
                'ask_volume1',
              ].includes(metric[1])
                ? 0
                : 2,
            )
          }}</b>
        </div>
      </div>
    </div>

    <div class="chart-card">
      <div class="section-title">
        <div>
          <span class="eyebrow">PRICE ACTION</span>
          <h3>K 线 · 策略买卖点 · 均线 · 成交量 · MACD</h3>
        </div>
        <div class="period-picker" role="group" aria-label="K 线周期">
          <button
            v-for="[value, label] in periods"
            :key="value"
            type="button"
            :class="{ active: timeframe === value }"
            :aria-pressed="timeframe === value"
            @click="timeframe = value"
          >
            {{ label }}
          </button>
        </div>
      </div>
      <div class="average-strip" aria-label="日线均价">
        <span v-for="average in averages" :key="average.days" :class="`ma-${average.days}`">
          MA{{ average.days }} · {{ average.days }} 日
          <b>{{ average.value == null ? '—' : display(String(average.value)) }}</b>
        </span>
      </div>
      <div v-if="!bars.length && !loading" class="empty-bars">
        <el-empty description="暂无已闭合 K 线；请确认合约已订阅并等待采集器完成历史恢复" />
      </div>
      <div ref="chartEl" class="market-chart" :class="{ 'chart-hidden': !bars.length }" />
      <p class="chart-note">
        最近 {{ bars.length }} 根 K 线 · 1 分钟显示最近两个交易日，库中分钟线保留 7 天 ·
        分钟周期由已闭合 1 分钟线按北京时间聚合，日线来自天勤 · 图中 MA5/20/60
        按当前周期的收盘价计算，上方数值为日均线 · 买卖点对应有效策略信号，悬停可看策略和触发价 ·
        拖动滑块缩放 · MACD（12, 26, 9）
      </p>
    </div>

    <div class="strategy-card">
      <div class="section-title">
        <div>
          <span class="eyebrow">STRATEGY REPLAY</span>
          <h3>关联策略回溯</h3>
        </div>
        <span>{{ currentStrategies.length }} 条策略</span>
      </div>
      <el-empty
        v-if="!currentStrategies.length"
        description="暂无关联策略，可到策略配置中创建此合约的策略"
      />
      <div v-for="item in currentStrategies" :key="item.id" class="strategy-row">
        <div>
          <b>{{ item.name }}</b
          ><span
            >{{ signalTypeLabel(item.signalType) }} · {{ displayTimeframe(item.timeframe) }} ·
            {{ item.status === 'ACTIVE' ? '运行中' : '已暂停' }}</span
          >
        </div>
        <el-button
          v-if="session.can('signal:backfill')"
          type="primary"
          plain
          :loading="backfilling === item.id"
          :disabled="item.status !== 'ACTIVE'"
          @click="backfill(item)"
          >{{ item.targetMode === 'WATCHLIST' ? '回溯自选列表' : '回溯最近 300 根' }}</el-button
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.contract-detail {
  display: grid;
  gap: 20px;
}
.detail-head,
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.detail-head {
  padding: 8px 2px;
}
.detail-head h2 {
  font-size: 32px;
  margin: 8px 0 2px;
  letter-spacing: 0.02em;
}
.detail-code {
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 400;
  margin-left: 9px;
}
.detail-exchange {
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 400;
  margin-left: 10px;
}
.detail-exchange::before {
  content: '·';
  margin-right: 10px;
}
.detail-head p {
  margin: 0;
  color: var(--el-text-color-secondary);
}
.eyebrow {
  display: block;
  color: var(--orange);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}
.quote-hero,
.chart-card,
.strategy-card {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--panel);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
}
.quote-hero {
  display: grid;
  grid-template-columns: minmax(190px, 24%) 1fr;
  overflow: hidden;
}
.price-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  background: linear-gradient(145deg, rgba(241, 129, 42, 0.13), rgba(241, 129, 42, 0.02));
}
.price-block strong {
  font-size: clamp(32px, 3vw, 48px);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.price-block small,
.field-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.price-change {
  font-size: 16px;
  font-weight: 700;
}
.rise {
  color: #e57532;
}
.fall {
  color: #2d9b7d;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 17px;
  border-left: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.metric span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.metric b {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.chart-card,
.strategy-card {
  padding: 22px;
}
.section-title {
  margin-bottom: 12px;
}
.section-title h3 {
  margin: 5px 0 0;
  font-size: 19px;
}
.average-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 4px 0 8px;
  font-size: 12px;
}
.average-strip span {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.average-strip b {
  color: inherit;
  font-variant-numeric: tabular-nums;
}
.ma-5 {
  color: #e05a5a;
}
.ma-20 {
  color: #e9c349;
}
.ma-60 {
  color: #4e9ce0;
}
.period-picker {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}
.period-picker button {
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 7px 10px;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.period-picker button:hover,
.period-picker button:focus-visible {
  border-color: var(--orange);
}
.period-picker button.active {
  border-color: var(--orange);
  color: #160c05;
  background: var(--orange);
  font-weight: 700;
}
.market-chart {
  width: 100%;
  height: 590px;
}
.chart-hidden {
  height: 0;
  overflow: hidden;
}
.chart-note {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.strategy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 0;
  border-top: 1px solid var(--line);
}
.strategy-row div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.strategy-row span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
@media (max-width: 850px) {
  .quote-hero {
    grid-template-columns: 1fr;
  }
  .metric-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .section-title {
    align-items: flex-start;
    flex-direction: column;
  }
  .market-chart {
    height: 480px;
  }
}
</style>
