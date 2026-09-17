<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { formatDateTime } from '@/utils/dateTime'
import { displayCode } from '@/utils/display'
import { useSessionStore } from '@/stores/session'

interface Issue {
  issueId: string
  status: string
  issueType: string
  summary: string
  occurrenceCount: number
  firstOccurredAt: string
  lastOccurredAt: string
  impactScope: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  relatedType: string | null
  relatedId: string | null
  handledBy: string | null
  handledAt: string | null
  handlingNote: string | null
}
interface Page {
  total: number
  issues: Issue[]
}
const session = useSessionStore()
const rows = ref<Issue[]>([])
const total = ref(0)
const loading = ref(false)
const pageNo = ref(1)
const filters = reactive({ issueType: '', status: '' })
async function load() {
  loading.value = true
  try {
    const response = await api.get<ApiResult<Page>>('/ops/listIssues', {
      params: { ...filters, pageNo: pageNo.value, pageSize: 20 },
    })
    rows.value = response.data.data.issues
    total.value = response.data.data.total
  } catch {
    ElMessage.error('系统问题加载失败')
  } finally {
    loading.value = false
  }
}
async function handle(row: Issue, status: string) {
  let note: string
  try {
    const result = await ElMessageBox.prompt('请输入处理备注', `标记为${displayCode(status)}`, {
      inputValidator: (value) => Boolean(value?.trim()) || '处理备注不能为空',
    })
    note = result.value
  } catch {
    return
  }
  try {
    await api.post('/ops/updateIssue', { issueId: row.issueId, status, handlingNote: note })
    ElMessage.success('问题状态已更新')
    await load()
  } catch {
    ElMessage.error('更新失败')
  }
}
onMounted(load)
</script>
<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">ISSUE AGGREGATION</span>
        <h2>系统问题</h2>
        <p>同类运行异常按聚合键累计，保留首次和最近发生时间。</p>
      </div>
      <el-button @click="load">刷新</el-button>
    </div>
    <el-form inline class="filters" @submit.prevent="load">
      <el-form-item label="类型"><el-input v-model="filters.issueType" clearable /></el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 140px">
          <el-option label="待处理" value="PENDING" />
          <el-option label="处理中" value="PROCESSING" />
          <el-option label="已解决" value="RESOLVED" />
          <el-option label="已忽略" value="IGNORED" />
        </el-select>
      </el-form-item>
      <el-button native-type="submit">查询</el-button>
    </el-form>
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="summary" label="摘要" min-width="210" />
      <el-table-column label="类型" width="140"
        ><template #default="s">{{ displayCode(s.row.issueType) }}</template></el-table-column
      >
      <el-table-column label="状态" width="105"
        ><template #default="s">{{ displayCode(s.row.status) }}</template></el-table-column
      >
      <el-table-column prop="occurrenceCount" label="次数" width="80" />
      <el-table-column label="影响范围" min-width="130">
        <template #default="s">{{ displayCode(s.row.impactScope) }}</template>
      </el-table-column>
      <el-table-column
        prop="lastErrorMessage"
        label="最近错误"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column label="最近发生" min-width="185">
        <template #default="s">{{ formatDateTime(s.row.lastOccurredAt) }}</template>
      </el-table-column>
      <el-table-column label="处理" width="190">
        <template #default="scope">
          <template v-if="session.can('issue:update')">
            <el-button link @click="handle(scope.row, 'PROCESSING')">处理中</el-button>
            <el-button link type="success" @click="handle(scope.row, 'RESOLVED')">解决</el-button>
            <el-button link @click="handle(scope.row, 'IGNORED')">忽略</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="pageNo"
      :page-size="20"
      :total="total"
      layout="prev, pager, next, total"
      @current-change="load"
    />
  </section>
</template>
