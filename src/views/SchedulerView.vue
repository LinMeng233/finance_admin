<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { formatDateTime } from '@/utils/dateTime'
import { displayCode } from '@/utils/display'
import { useSessionStore } from '@/stores/session'

interface Task {
  taskId: string
  taskKey: string
  taskName: string
  status: string
  cronExpression: string
  lastStartedAt: string | null
  lastFinishedAt: string | null
  lastResult: string | null
  nextRunAt: string | null
  lastErrorCode: string | null
}
const session = useSessionStore()
const rows = ref<Task[]>([])
const loading = ref(false)
const running = ref('')
async function load() {
  loading.value = true
  try {
    rows.value = (await api.get<ApiResult<Task[]>>('/ops/listTasks')).data.data
  } catch {
    ElMessage.error('调度任务加载失败')
  } finally {
    loading.value = false
  }
}
async function trigger(row: Task) {
  try {
    await ElMessageBox.confirm(`立即运行“${row.taskName}”吗？`, '手动运行')
  } catch {
    return
  }
  running.value = row.taskKey
  try {
    await api.post('/ops/triggerTask', null, { params: { taskKey: row.taskKey } })
    ElMessage.success('任务执行完成')
    await load()
  } catch {
    ElMessage.error('任务正在运行、已停用或执行失败')
  } finally {
    running.value = ''
  }
}
onMounted(load)
</script>
<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">QUARTZ CONTROL</span>
        <h2>调度中心</h2>
        <p>查看后台任务的计划与真实执行结果；同一任务不会并发重复运行。</p>
      </div>
      <el-button @click="load">刷新</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="taskName" label="任务" min-width="160" />
      <el-table-column prop="taskKey" label="标识" min-width="170" />
      <el-table-column label="状态" width="100"
        ><template #default="s">{{ displayCode(s.row.status) }}</template></el-table-column
      >
      <el-table-column prop="cronExpression" label="计划" min-width="150" />
      <el-table-column label="最近开始" min-width="185">
        <template #default="s">{{ formatDateTime(s.row.lastStartedAt) }}</template>
      </el-table-column>
      <el-table-column label="最近结果" width="110"
        ><template #default="s">{{ displayCode(s.row.lastResult) }}</template></el-table-column
      >
      <el-table-column prop="lastErrorCode" label="失败原因" min-width="140" />
      <el-table-column label="操作" width="100">
        <template #default="scope">
          <el-button
            v-if="session.can('scheduler:trigger')"
            link
            type="primary"
            :loading="running === scope.row.taskKey"
            @click="trigger(scope.row)"
            >运行</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>
