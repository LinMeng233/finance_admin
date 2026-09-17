<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { useRouter } from 'vue-router'
import { contractChineseLabel, contractShortCode } from '@/utils/contract'

interface Instrument {
  productCode: string
  productName: string
  exchangeCode: string
  exchangeName: string
  dominantContract?: string
  subscribed: boolean
  enabledWebhookCount: number
  dominantRefreshedAt?: string
}

const loading = ref(false)
const requestingDominants = ref(false)
const refreshTimers: number[] = []
const router = useRouter()
const rows = ref<Instrument[]>([])
const total = ref(0)
const subscribeDialogVisible = ref(false)
const subscribing = ref(false)
const selectedInstrument = ref<Instrument>()
const availableContracts = ref<string[]>([])
const selectedContracts = ref<string[]>([])
const query = reactive({ keyword: '', exchange: '', pageNo: 1, pageSize: 20 })
const exchanges = [
  { code: 'SHFE', name: '上海期货交易所' },
  { code: 'INE', name: '上海国际能源交易中心' },
  { code: 'DCE', name: '大连商品交易所' },
  { code: 'CZCE', name: '郑州商品交易所' },
  { code: 'CFFEX', name: '中国金融期货交易所' },
  { code: 'GFEX', name: '广州期货交易所' },
]

async function load() {
  loading.value = true
  try {
    const response = await api.get<ApiResult<{ total: number; instruments: Instrument[] }>>(
      '/market/listInstruments',
      {
        params: {
          pageNo: query.pageNo,
          pageSize: query.pageSize,
          keyword: query.keyword || undefined,
          exchange: query.exchange || undefined,
        },
      },
    )
    rows.value = response.data.data.instruments
    total.value = response.data.data.total
  } catch {
    rows.value = []
    total.value = 0
    ElMessage.error('品种列表加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

async function refreshDominants() {
  if (requestingDominants.value) return
  requestingDominants.value = true
  try {
    await api.post('/market/requestDominantRefresh')
    ElMessage.success('已请求天勤刷新全部品种主力合约，结果将在约 10–30 秒内更新')
    await load()
    for (const delay of [10_000, 20_000, 30_000]) {
      refreshTimers.push(window.setTimeout(load, delay))
    }
  } catch {
    ElMessage.error('主力合约刷新请求失败')
  } finally {
    requestingDominants.value = false
  }
}

onBeforeUnmount(() => refreshTimers.forEach((timer) => clearTimeout(timer)))

async function cancelSubscription(row: Instrument) {
  await api.post('/market/updateSubscription', {
    targetType: 'PRODUCT',
    targetCode: row.productCode,
    subscribed: false,
  })
  ElMessage.success('已取消主力合约订阅')
  await load()
}

async function openSubscribeDialog(row: Instrument) {
  selectedInstrument.value = row
  selectedContracts.value = []
  subscribeDialogVisible.value = true
  try {
    const response = await api.get<ApiResult<{ contractCode: string }[]>>('/market/listContracts', {
      params: { productCode: row.productCode },
    })
    availableContracts.value = response.data.data
      .map((item) => item.contractCode)
      .filter((contract) => contract !== row.dominantContract)
  } catch {
    availableContracts.value = []
    ElMessage.warning('非主力合约目录暂不可用，仍可订阅主力合约')
  }
}

async function confirmSubscription() {
  if (!selectedInstrument.value) return
  subscribing.value = true
  try {
    await api.post('/market/updateSubscription', {
      targetType: 'PRODUCT',
      targetCode: selectedInstrument.value.productCode,
      subscribed: true,
    })
    await Promise.all(
      selectedContracts.value.map((contract) =>
        api.post('/market/updateSubscription', {
          targetType: 'CONTRACT',
          targetCode: contract,
          subscribed: true,
        }),
      ),
    )
    ElMessage.success(
      selectedContracts.value.length > 0
        ? `已订阅主力及 ${selectedContracts.value.length} 个非主力合约`
        : '已订阅主力合约',
    )
    subscribeDialogVisible.value = false
    await router.push('/subscriptions')
  } finally {
    subscribing.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">MARKET CATALOG</span>
        <h2>品种管理</h2>
        <p>维护全部期货品种；订阅后进入订阅品种页面并自动跟随当前主力。</p>
      </div>
      <el-button type="primary" :loading="requestingDominants" @click="refreshDominants"
        >刷新主力合约</el-button
      >
    </div>
    <el-form inline class="filters" @submit.prevent="load">
      <el-form-item label="关键词"
        ><el-input v-model="query.keyword" clearable placeholder="代码或名称"
      /></el-form-item>
      <el-form-item label="交易所"
        ><el-select v-model="query.exchange" clearable style="width: 250px"
          ><el-option
            v-for="item in exchanges"
            :key="item.code"
            :label="`${item.name} ${item.code}`"
            :value="item.code"
          >
            <span>{{ item.name }}</span
            ><small class="exchange-code">{{ item.code }}</small>
          </el-option></el-select
        ></el-form-item
      >
      <el-button @click="load">查询</el-button>
    </el-form>
    <el-table v-loading="loading" :data="rows" empty-text="暂无符合条件的品种">
      <el-table-column label="品种" min-width="160"
        ><template #default="scope">
          <strong>{{ scope.row.productName }}</strong
          ><small class="exchange-code">{{ scope.row.productCode }}</small>
        </template></el-table-column
      >
      <el-table-column label="交易所" min-width="190">
        <template #default="scope">
          <span class="exchange-name">{{ scope.row.exchangeName }}</span>
          <small class="exchange-code">{{ scope.row.exchangeCode }}</small>
        </template>
      </el-table-column>
      <el-table-column label="当前主力" min-width="190"
        ><template #default="scope">
          <template v-if="scope.row.dominantContract">
            <strong>{{
              contractChineseLabel(scope.row.productName, scope.row.dominantContract)
            }}</strong>
            <small class="exchange-code">{{
              contractShortCode(scope.row.dominantContract)
            }}</small> </template
          ><span v-else>{{ scope.row.dominantRefreshedAt ? '暂无可交易主力' : '待刷新' }}</span>
        </template></el-table-column
      >
      <el-table-column label="通知" width="100"
        ><template #default="scope"
          >{{ scope.row.enabledWebhookCount }} 个</template
        ></el-table-column
      >
      <el-table-column label="状态" width="110"
        ><template #default="scope"
          ><el-tag :type="scope.row.subscribed ? 'success' : 'info'">{{
            scope.row.subscribed ? '采集中' : '未订阅'
          }}</el-tag></template
        ></el-table-column
      >
      <el-table-column label="操作" width="130"
        ><template #default="scope"
          ><el-button
            link
            :type="scope.row.subscribed ? 'danger' : 'primary'"
            :disabled="!scope.row.subscribed && !scope.row.dominantContract"
            @click="
              scope.row.subscribed ? cancelSubscription(scope.row) : openSubscribeDialog(scope.row)
            "
            >{{ scope.row.subscribed ? '取消订阅' : '订阅' }}</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <el-pagination
      v-model:current-page="query.pageNo"
      v-model:page-size="query.pageSize"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="load"
    />
  </section>

  <el-dialog
    v-model="subscribeDialogVisible"
    :title="`订阅${selectedInstrument?.productName ?? ''}`"
    width="520px"
  >
    <div class="subscription-choice main-choice">
      <el-checkbox :model-value="true" disabled>主力合约（默认订阅并自动跟随）</el-checkbox>
      <small>{{
        selectedInstrument?.dominantContract
          ? `${contractChineseLabel(selectedInstrument.productName, selectedInstrument.dominantContract)} · ${contractShortCode(selectedInstrument.dominantContract)}`
          : '采集器连接后自动识别当前主力'
      }}</small>
    </div>
    <div class="contract-section">
      <strong>非主力合约</strong>
      <p>按需勾选需要同时采集的指定合约。</p>
      <el-checkbox-group v-if="availableContracts.length" v-model="selectedContracts">
        <el-checkbox
          v-for="contract in availableContracts"
          :key="contract"
          :value="contract"
          border
        >
          {{ contractChineseLabel(selectedInstrument?.productName || '', contract) }}
          <small class="exchange-code">{{ contractShortCode(contract) }}</small>
        </el-checkbox>
      </el-checkbox-group>
      <el-empty v-else :image-size="54" description="暂无非主力合约，等待行情采集器同步" />
    </div>
    <template #footer>
      <el-button @click="subscribeDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="subscribing" @click="confirmSubscription">
        确认订阅
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.exchange-name {
  color: var(--el-text-color-primary);
}

.exchange-code {
  margin-left: 7px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.subscription-choice {
  padding: 14px;
  border: 1px solid var(--el-border-color-light);
  background: color-mix(in srgb, var(--orange) 6%, transparent);
}

.subscription-choice small {
  display: block;
  margin: 6px 0 0 25px;
  color: var(--el-text-color-secondary);
}

.contract-section {
  margin-top: 20px;
}

.contract-section p {
  margin: 6px 0 14px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.contract-section .el-checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.contract-section .el-checkbox {
  margin: 0;
}
</style>
