<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { contractChineseLabel, contractShortCode } from '@/utils/contract'

interface Dominant {
  productCode: string
  productName: string
  exchangeCode: string
  exchangeName: string
  contractCode?: string
}
interface Subscription {
  targetType: 'PRODUCT' | 'CONTRACT'
  targetCode: string
}
interface CompositeCondition {
  type: string
  timeframe: string
  value: number
  fastPeriod: number
  slowPeriod: number
  direction: string
}
function newCondition(): CompositeCondition {
  return {
    type: 'MA5_MA20_UP',
    timeframe: '1min',
    value: 0,
    fastPeriod: 5,
    slowPeriod: 20,
    direction: 'UP',
  }
}

interface Strategy {
  id: string
  name: string
  status: string
  targetMode: string
  productCode: string
  actualContract?: string
  timeframe: string
  signalType: string
  allowBackfill: boolean
  remark?: string
  configVersion: number
  parameters: Record<string, unknown>
  effectiveFrom: string
}
const rows = ref<Strategy[]>([])
const products = ref<Dominant[]>([])
const subscriptions = ref<Subscription[]>([])
const session = useSessionStore()
const selected = ref<Strategy[]>([])
const editing = ref<Strategy | null>(null)
const total = ref(0)
const dialog = ref(false)
const loading = ref(false)
const reviewDialog = ref(false)
const reviewName = ref('')
const reviewRows = ref<
  {
    horizonBars: number
    sampleCount: number
    favorableCount: number
    averageDirectionalReturnPercent: string
  }[]
>([])
const query = reactive({ keyword: '', status: '', pageNo: 1, pageSize: 20 })
const form = reactive({
  name: '',
  targetMode: 'SPECIFIC_CONTRACT',
  productCode: '',
  productCodes: [] as string[],
  actualContract: '',
  timeframe: '1min',
  signalType: 'SMA_CROSS',
  fastPeriod: 5,
  slowPeriod: 20,
  direction: 'ANY',
  cooldownMinutes: 0,
  conditions: [newCondition(), { ...newCondition(), type: 'PRICE_ABOVE' }] as CompositeCondition[],
  enabled: true,
  allowBackfill: true,
  remark: '',
})
const isSma = computed(() => form.signalType === 'SMA_CROSS')
const watchlistProducts = computed(() =>
  products.value.filter((product) =>
    subscriptions.value.some(
      (subscription) =>
        subscription.targetType === 'PRODUCT' && subscription.targetCode === product.productCode,
    ),
  ),
)
const contractOptions = computed(() => {
  const product = products.value.find((item) => item.productCode === form.productCode)
  if (!product) return []
  const codes = new Set<string>()
  if (
    product.contractCode &&
    subscriptions.value.some(
      (item) => item.targetType === 'PRODUCT' && item.targetCode === product.productCode,
    )
  )
    codes.add(product.contractCode)
  for (const item of subscriptions.value) {
    if (
      item.targetType === 'CONTRACT' &&
      item.targetCode.startsWith(`${product.exchangeCode}.${product.productCode}`) &&
      item.targetCode.split('.')[1]?.match(/^[A-Za-z]+/)?.[0] === product.productCode
    )
      codes.add(item.targetCode)
  }
  return [...codes].map((code) => ({
    value: code,
    label: `${contractChineseLabel(product.productName, code)} · ${contractShortCode(code)}`,
  }))
})
const signalTypes = [
  ['SMA_CROSS', '自定义双均线交叉'],
  ['MA5_MA20_ANY', '五日与二十日均线双向交叉'],
  ['MA5_MA20_UP', '五日与二十日均线金叉'],
  ['MA5_MA20_DOWN', '五日与二十日均线死叉'],
  ['MA5_MA20_STRONG_UP', '强金叉'],
  ['MA5_MA20_STRONG_DOWN', '强死叉'],
  ['MACD_FIRST_UP', '指标零轴上首次金叉'],
  ['MACD_FIRST_DOWN', '指标零轴下首次死叉'],
  ['COMBINATION_UP', '均线与指标多头组合'],
  ['COMBINATION_DOWN', '均线与指标空头组合'],
  ['COMPOSITE', '组合条件告警'],
]
const conditionTypes = [
  ...signalTypes.filter(([code]) => !['COMPOSITE', 'SMA_CROSS'].includes(code)),
  ['SMA_CROSS', '自定义双均线交叉'],
  ['PRICE_ABOVE', '价格高于'],
  ['PRICE_BELOW', '价格低于'],
  ['VOLUME_ABOVE', '成交量高于'],
]
const timeframes = [
  ['1min', '一分钟'],
  ['5min', '五分钟'],
  ['15min', '十五分钟'],
  ['30min', '三十分钟'],
  ['1h', '一小时'],
  ['D', '日线'],
]
function optionLabel(options: string[][], value: string) {
  return options.find(([code]) => code === value)?.[1] ?? value
}
function productLabel(code: string) {
  return products.value.find((item) => item.productCode === code)?.productName ?? code
}
function actualContractLabel(row: Strategy) {
  if (row.targetMode === 'WATCHLIST')
    return `自选 ${(row.parameters.productCodes as string[] | undefined)?.length || 0} 个品种`
  return row.actualContract
    ? `${contractChineseLabel(productLabel(row.productCode), row.actualContract)} · ${contractShortCode(row.actualContract)}`
    : '跟随主力'
}
async function load() {
  loading.value = true
  try {
    const r = await api.get<ApiResult<{ total: number; records: Strategy[] }>>(
      '/strategy/listStrategies',
      {
        params: {
          keyword: query.keyword || undefined,
          status: query.status || undefined,
          pageNo: query.pageNo,
          pageSize: query.pageSize,
        },
      },
    )
    rows.value = r.data.data.records
    total.value = r.data.data.total
  } finally {
    loading.value = false
  }
}
async function loadOptions() {
  const [catalog, subscribed] = await Promise.all([
    api.get<
      ApiResult<{
        instruments: (Dominant & { dominantContract?: string })[]
      }>
    >('/market/listInstruments', { params: { pageNo: 1, pageSize: 100 } }),
    api.get<ApiResult<Subscription[]>>('/market/listSubscriptions'),
  ])
  subscriptions.value = subscribed.data.data
  const subscribedProducts = new Set(
    subscriptions.value.map((item) =>
      item.targetType === 'PRODUCT'
        ? item.targetCode
        : (item.targetCode.split('.')[1]?.match(/^[A-Za-z]+/)?.[0] ?? ''),
    ),
  )
  products.value = catalog.data.data.instruments
    .filter((item) => subscribedProducts.has(item.productCode))
    .map((item) => ({ ...item, contractCode: item.dominantContract }))
}
function onProductChange() {
  form.actualContract = contractOptions.value[0]?.value ?? ''
}
function body() {
  return {
    name: form.name,
    targetMode: form.targetMode,
    productCode: form.targetMode === 'WATCHLIST' ? form.productCodes[0] : form.productCode,
    actualContract: form.targetMode === 'SPECIFIC_CONTRACT' ? form.actualContract : null,
    timeframe: form.timeframe,
    signalType: form.signalType,
    parameters: {
      ...(isSma.value
        ? { fastPeriod: form.fastPeriod, slowPeriod: form.slowPeriod, direction: form.direction }
        : {}),
      ...(form.signalType === 'COMPOSITE'
        ? {
            direction: form.direction,
            conditions: form.conditions.map((condition) => ({
              type: condition.type,
              timeframe: condition.timeframe,
              value: condition.value,
              parameters:
                condition.type === 'SMA_CROSS'
                  ? {
                      fastPeriod: condition.fastPeriod,
                      slowPeriod: condition.slowPeriod,
                      direction: condition.direction,
                    }
                  : {},
            })),
          }
        : {}),
      ...(form.targetMode === 'WATCHLIST' ? { productCodes: form.productCodes } : {}),
      cooldownMinutes: form.cooldownMinutes,
    },
    enabled: form.enabled,
    allowBackfill: form.allowBackfill,
    remark: form.remark,
  }
}
async function save() {
  if (
    form.targetMode === 'WATCHLIST' &&
    (!form.productCodes.length ||
      form.productCodes.some(
        (code) => !watchlistProducts.value.some((product) => product.productCode === code),
      ))
  ) {
    ElMessage.warning('请选择已订阅的自选品种')
    return
  }
  if (
    form.targetMode !== 'WATCHLIST' &&
    !products.value.some((item) => item.productCode === form.productCode)
  ) {
    ElMessage.warning('请选择已订阅品种')
    return
  }
  if (
    form.targetMode === 'SPECIFIC_CONTRACT' &&
    !contractOptions.value.some((item) => item.value === form.actualContract)
  ) {
    ElMessage.warning('请选择该品种已订阅的合约')
    return
  }
  if (editing.value) {
    await api.post(`/strategy/${editing.value.id}/updateStrategy`, {
      expectedVersion: editing.value.configVersion,
      strategy: body(),
    })
  } else {
    await api.post('/strategy/createStrategy', body())
  }
  dialog.value = false
  ElMessage.success(editing.value ? '策略已更新并生成新版本' : '策略已创建并生成配置版本')
  await load()
}
async function openCreate() {
  try {
    await loadOptions()
  } catch {
    ElMessage.error('订阅选项加载失败')
    return
  }
  editing.value = null
  Object.assign(form, {
    name: '',
    targetMode: 'SPECIFIC_CONTRACT',
    productCode: products.value[0]?.productCode ?? '',
    productCodes: [],
    actualContract: '',
    timeframe: '1min',
    signalType: 'SMA_CROSS',
    fastPeriod: 5,
    slowPeriod: 20,
    direction: 'ANY',
    cooldownMinutes: 0,
    conditions: [newCondition(), { ...newCondition(), type: 'PRICE_ABOVE' }],
    enabled: true,
    allowBackfill: true,
    remark: '',
  })
  onProductChange()
  dialog.value = true
}
async function openEdit(row: Strategy) {
  try {
    await loadOptions()
  } catch {
    ElMessage.error('订阅选项加载失败')
    return
  }
  editing.value = row
  Object.assign(form, {
    name: row.name,
    targetMode: row.targetMode,
    productCode: row.productCode,
    productCodes: Array.isArray(row.parameters.productCodes)
      ? [...row.parameters.productCodes]
      : [],
    actualContract: row.actualContract || '',
    timeframe: row.timeframe,
    signalType: row.signalType,
    fastPeriod: Number(row.parameters.fastPeriod || 5),
    slowPeriod: Number(row.parameters.slowPeriod || 20),
    direction: String(row.parameters.direction || 'ANY'),
    cooldownMinutes: Number(row.parameters.cooldownMinutes || 0),
    conditions: Array.isArray(row.parameters.conditions)
      ? (
          row.parameters.conditions as {
            type: string
            timeframe: string
            value?: number
            parameters?: Record<string, unknown>
          }[]
        ).map((item) => ({
          type: item.type,
          timeframe: item.timeframe,
          value: Number(item.value || 0),
          fastPeriod: Number(item.parameters?.fastPeriod || 5),
          slowPeriod: Number(item.parameters?.slowPeriod || 20),
          direction: String(item.parameters?.direction || 'UP'),
        }))
      : [newCondition(), { ...newCondition(), type: 'PRICE_ABOVE' }],
    enabled: row.status === 'ACTIVE',
    allowBackfill: row.allowBackfill,
    remark: row.remark || '',
  })
  dialog.value = true
}
async function toggle(row: Strategy) {
  await api.post(`/strategy/${row.id}/updateStrategyStatus`, {
    expectedVersion: row.configVersion,
    enabled: row.status !== 'ACTIVE',
  })
  ElMessage.success('状态已更新')
  await load()
}
async function remove(row: Strategy) {
  await ElMessageBox.confirm(`确定删除策略“${row.name}”？历史信号仍会保留。`, '删除策略', {
    type: 'warning',
  })
  await api.post(`/strategy/${row.id}/deleteStrategy`, { expectedVersion: row.configVersion })
  ElMessage.success('策略已删除')
  await load()
}
async function backfill(row: Strategy) {
  await ElMessageBox.confirm(`按最近 300 根 K 线回溯“${row.name}”吗？`, '历史回溯')
  const response = await api.post<ApiResult<{ queuedBars: number }>>(`/strategy/${row.id}/backfill`)
  ElMessage.success(`已加入 ${response.data.data.queuedBars} 根 K 线计算任务`)
}
async function review(row: Strategy) {
  const responses = await Promise.all(
    [5, 20].map((horizonBars) =>
      api.get<
        ApiResult<{
          horizonBars: number
          sampleCount: number
          favorableCount: number
          averageDirectionalReturnPercent: string
        }>
      >('/signal/getSignalReview', { params: { strategyId: row.id, horizonBars } }),
    ),
  )
  reviewName.value = row.name
  reviewRows.value = responses.map((response) => response.data.data)
  reviewDialog.value = true
}
async function batchStatus(enabled: boolean) {
  if (!selected.value.length) return
  await api.post('/strategy/batchUpdateStatus', {
    changes: selected.value.map((row) => ({
      id: row.id,
      expectedVersion: row.configVersion,
      enabled,
    })),
  })
  ElMessage.success(`已批量${enabled ? '启用' : '暂停'} ${selected.value.length} 条策略`)
  selected.value = []
  await load()
}
onMounted(() => {
  void load()
  void loadOptions().catch(() => ElMessage.warning('订阅品种加载失败，合约名称暂不可用'))
})
</script>
<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">VERSIONED STRATEGY</span>
        <h2>策略配置</h2>
        <p>每次变更生成不可变版本，运行任务始终引用当时版本。</p>
      </div>
      <el-button v-if="session.can('strategy:create')" type="primary" @click="openCreate"
        >新建策略</el-button
      >
    </div>
    <el-form inline class="filters"
      ><el-form-item label="搜索"><el-input v-model="query.keyword" clearable /></el-form-item
      ><el-form-item label="状态"
        ><el-select v-model="query.status" clearable style="width: 120px"
          ><el-option label="启用" value="ACTIVE" /><el-option
            label="暂停"
            value="PAUSED" /></el-select></el-form-item
      ><el-button @click="load">查询</el-button
      ><el-button
        v-if="session.can('strategy:toggle')"
        :disabled="!selected.length"
        @click="batchStatus(true)"
        >批量启用</el-button
      ><el-button
        v-if="session.can('strategy:toggle')"
        :disabled="!selected.length"
        @click="batchStatus(false)"
        >批量暂停</el-button
      ></el-form
    >
    <el-table
      v-loading="loading"
      :data="rows"
      @selection-change="(value: Strategy[]) => (selected = value)"
      ><el-table-column type="selection" width="48" /><el-table-column
        prop="name"
        label="名称"
        min-width="160"
      /><el-table-column label="品种"
        ><template #default="s"
          >{{ productLabel(s.row.productCode) }} <small>{{ s.row.productCode }}</small></template
        ></el-table-column
      ><el-table-column label="实际合约" min-width="160"
        ><template #default="s">{{ actualContractLabel(s.row) }}</template></el-table-column
      ><el-table-column label="周期"
        ><template #default="s">{{
          optionLabel(timeframes, s.row.timeframe)
        }}</template></el-table-column
      ><el-table-column label="信号" min-width="220"
        ><template #default="s">{{
          optionLabel(signalTypes, s.row.signalType)
        }}</template></el-table-column
      ><el-table-column label="版本"
        ><template #default="s">v{{ s.row.configVersion }}</template></el-table-column
      ><el-table-column label="状态"
        ><template #default="s"
          ><el-tag :type="s.row.status === 'ACTIVE' ? 'success' : 'info'">{{
            s.row.status === 'ACTIVE' ? '启用' : '暂停'
          }}</el-tag></template
        ></el-table-column
      ><el-table-column label="操作" width="260"
        ><template #default="s"
          ><el-button v-if="session.can('strategy:update')" link @click="openEdit(s.row)"
            >编辑</el-button
          ><el-button v-if="session.can('strategy:toggle')" link @click="toggle(s.row)">{{
            s.row.status === 'ACTIVE' ? '暂停' : '启用'
          }}</el-button
          ><el-button v-if="session.can('signal:backfill')" link @click="backfill(s.row)"
            >回溯</el-button
          ><el-button v-if="session.can('signal:read')" link @click="review(s.row)">复盘</el-button
          ><el-button
            v-if="session.can('strategy:delete')"
            link
            type="danger"
            @click="remove(s.row)"
            >删除</el-button
          ></template
        ></el-table-column
      ></el-table
    >
    <el-pagination
      v-model:current-page="query.pageNo"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="load"
    />
    <el-dialog v-model="dialog" :title="editing ? '编辑策略' : '新建策略'" width="620"
      ><el-form label-width="110px"
        ><el-form-item label="名称"><el-input v-model="form.name" maxlength="100" /></el-form-item
        ><el-form-item label="目标模式"
          ><el-radio-group v-model="form.targetMode"
            ><el-radio value="SPECIFIC_CONTRACT">指定合约</el-radio
            ><el-radio value="FOLLOW_DOMINANT">跟随主力</el-radio
            ><el-radio value="WATCHLIST">自选品种列表</el-radio></el-radio-group
          ></el-form-item
        ><el-form-item v-if="form.targetMode === 'WATCHLIST'" label="自选品种"
          ><el-select
            v-model="form.productCodes"
            multiple
            filterable
            style="width: 100%"
            :multiple-limit="20"
          >
            <el-option
              v-for="item in watchlistProducts"
              :key="item.productCode"
              :label="`${item.productName} · ${item.productCode}`"
              :value="item.productCode"
            /> </el-select></el-form-item
        ><el-form-item v-else label="品种"
          ><el-select
            v-model="form.productCode"
            style="width: 100%"
            placeholder="请选择已订阅品种"
            @change="onProductChange"
            ><el-option
              v-for="item in products"
              :key="item.productCode"
              :label="`${item.productName} · ${item.exchangeName}`"
              :value="item.productCode" /></el-select></el-form-item
        ><el-form-item v-if="form.targetMode === 'SPECIFIC_CONTRACT'" label="实际合约"
          ><el-select
            v-model="form.actualContract"
            style="width: 100%"
            placeholder="请选择已订阅合约"
            ><el-option
              v-for="item in contractOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select></el-form-item
        ><el-form-item label="周期"
          ><el-select v-model="form.timeframe"
            ><el-option
              v-for="item in timeframes"
              :key="item[0]"
              :label="item[1]"
              :value="item[0]" /></el-select></el-form-item
        ><el-form-item label="信号规则"
          ><el-select v-model="form.signalType" style="width: 100%"
            ><el-option
              v-for="item in signalTypes"
              :key="item[0]"
              :label="item[1]"
              :value="item[0]" /></el-select></el-form-item
        ><template v-if="isSma"
          ><el-form-item label="均线周期"
            ><el-input-number v-model="form.fastPeriod" :min="2" :max="499" />
            <span class="field-gap">—</span>
            <el-input-number v-model="form.slowPeriod" :min="3" :max="500" /></el-form-item
          ><el-form-item label="方向"
            ><el-radio-group v-model="form.direction"
              ><el-radio value="ANY">双向</el-radio><el-radio value="UP">金叉</el-radio
              ><el-radio value="DOWN">死叉</el-radio></el-radio-group
            ></el-form-item
          ></template
        ><template v-if="form.signalType === 'COMPOSITE'">
          <el-form-item label="告警方向"
            ><el-radio-group v-model="form.direction">
              <el-radio value="UP">看涨</el-radio><el-radio value="DOWN">看跌</el-radio>
            </el-radio-group></el-form-item
          >
          <el-form-item
            v-for="(condition, index) in form.conditions"
            :key="index"
            :label="`条件 ${index + 1}`"
          >
            <div style="display: flex; flex-wrap: wrap; gap: 8px; width: 100%">
              <el-select v-model="condition.type" style="width: 205px">
                <el-option
                  v-for="item in conditionTypes"
                  :key="item[0]"
                  :label="item[1]"
                  :value="item[0]"
                />
              </el-select>
              <el-select v-model="condition.timeframe" style="width: 100px">
                <el-option
                  v-for="item in timeframes"
                  :key="item[0]"
                  :label="item[1]"
                  :value="item[0]"
                />
              </el-select>
              <el-input-number
                v-if="['PRICE_ABOVE', 'PRICE_BELOW', 'VOLUME_ABOVE'].includes(condition.type)"
                v-model="condition.value"
                :min="0"
              />
              <template v-if="condition.type === 'SMA_CROSS'">
                <el-input-number v-model="condition.fastPeriod" :min="2" :max="499" />
                <el-input-number v-model="condition.slowPeriod" :min="3" :max="500" />
                <el-select v-model="condition.direction" style="width: 90px">
                  <el-option label="双向" value="ANY" /><el-option
                    label="金叉"
                    value="UP"
                  /><el-option label="死叉" value="DOWN" />
                </el-select>
              </template>
              <el-button
                v-if="form.conditions.length > 2"
                link
                type="danger"
                @click="form.conditions.splice(index, 1)"
                >移除</el-button
              >
            </div>
          </el-form-item>
          <el-form-item label=" "
            ><el-button
              :disabled="form.conditions.length >= 5"
              @click="form.conditions.push(newCondition())"
              >添加条件</el-button
            ></el-form-item
          > </template
        ><el-form-item label="通知冷却"
          ><el-input-number v-model="form.cooldownMinutes" :min="0" :max="10080" />
          <span class="field-gap">分钟；0 为关闭</span></el-form-item
        ><el-form-item label="选项"
          ><el-checkbox v-model="form.enabled">立即启用</el-checkbox
          ><el-checkbox v-model="form.allowBackfill">允许历史回补</el-checkbox></el-form-item
        ><el-form-item label="备注"
          ><el-input v-model="form.remark" type="textarea" /></el-form-item></el-form
      ><template #footer
        ><el-button @click="dialog = false">取消</el-button
        ><el-button type="primary" :disabled="!form.name" @click="save">保存</el-button></template
      ></el-dialog
    >
    <el-dialog v-model="reviewDialog" :title="`${reviewName} · 信号效果复盘`" width="620">
      <p>
        按触发后第 N 根同合约、同周期 K
        线的收盘价统计；上涨信号以涨幅、下跌信号以跌幅为有利方向。仅纳入仍有足够后续行情的有效信号。
      </p>
      <el-table :data="reviewRows">
        <el-table-column prop="horizonBars" label="观察 K 线数" />
        <el-table-column prop="sampleCount" label="样本数" />
        <el-table-column label="有利比例"
          ><template #default="s">{{
            s.row.sampleCount
              ? `${((s.row.favorableCount / s.row.sampleCount) * 100).toFixed(1)}%`
              : '—'
          }}</template></el-table-column
        >
        <el-table-column label="平均方向涨跌幅"
          ><template #default="s">{{
            s.row.sampleCount ? `${Number(s.row.averageDirectionalReturnPercent).toFixed(2)}%` : '—'
          }}</template></el-table-column
        >
      </el-table>
    </el-dialog>
  </section>
</template>
