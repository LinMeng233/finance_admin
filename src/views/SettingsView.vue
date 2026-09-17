<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { formatDateTime } from '@/utils/dateTime'
import { displayCode } from '@/utils/display'
import { useSessionStore } from '@/stores/session'

interface Webhook {
  id: string
  status: 'ENABLED' | 'DISABLED'
  scopeType: 'GLOBAL' | 'PRODUCT'
  productCode: string | null
  name: string
  maskedUrl: string
  creatorId: string
  createdAt: string
  updatedAt: string
}
const session = useSessionStore()
const rows = ref<Webhook[]>([])
const productOptions = ref<{ code: string; name: string }[]>([])
const masterEnabled = ref(true)
const loading = ref(false)
const saving = ref(false)
const dialog = ref(false)
const editingId = ref('')
const form = reactive({
  scopeType: 'PRODUCT' as 'GLOBAL' | 'PRODUCT',
  productCode: '',
  name: '',
  webhookUrl: '',
  signingSecret: '',
  enabled: true,
})
async function load() {
  loading.value = true
  try {
    const [list, master] = await Promise.all([
      api.get<ApiResult<Webhook[]>>('/notification/listWebhooks'),
      api.get<ApiResult<{ enabled: boolean }>>('/notification/getMasterSwitch'),
    ])
    rows.value = list.data.data
    masterEnabled.value = master.data.data.enabled
    try {
      const catalog = await api.get<
        ApiResult<{ instruments: { productCode: string; productName: string }[] }>
      >('/market/listInstruments', { params: { pageNo: 1, pageSize: 100 } })
      productOptions.value = catalog.data.data.instruments.map((item) => ({
        code: item.productCode,
        name: item.productName,
      }))
    } catch {
      productOptions.value = []
    }
  } catch {
    ElMessage.error('通知设置加载失败')
  } finally {
    loading.value = false
  }
}
async function toggleMaster(value: boolean) {
  try {
    await api.post('/notification/updateMasterSwitch', { enabled: value })
    ElMessage.success(value ? '全部通知已启用' : '全部通知已停用')
  } catch {
    masterEnabled.value = !value
    ElMessage.error('总开关更新失败')
  }
}
function openCreate() {
  editingId.value = ''
  Object.assign(form, {
    scopeType: session.user?.role === 'SUPER_ADMIN' ? 'GLOBAL' : 'PRODUCT',
    productCode: '',
    name: '',
    webhookUrl: '',
    signingSecret: '',
    enabled: true,
  })
  dialog.value = true
}
function openEdit(row: Webhook) {
  editingId.value = row.id
  Object.assign(form, {
    scopeType: row.scopeType,
    productCode: row.productCode || '',
    name: row.name,
    webhookUrl: '',
    signingSecret: '',
    enabled: row.status === 'ENABLED',
  })
  dialog.value = true
}
async function save() {
  if (!form.name || !form.webhookUrl || (form.scopeType === 'PRODUCT' && !form.productCode)) {
    ElMessage.warning('请填写完整配置，编辑时需重新输入 Webhook 地址')
    return
  }
  saving.value = true
  try {
    const body = { ...form, productCode: form.scopeType === 'PRODUCT' ? form.productCode : null }
    if (editingId.value) await api.post(`/notification/${editingId.value}/updateWebhook`, body)
    else await api.post('/notification/createWebhook', body)
    dialog.value = false
    ElMessage.success('Webhook 已保存')
    await load()
  } catch {
    ElMessage.error('Webhook 保存失败，请检查地址和权限')
  } finally {
    saving.value = false
  }
}
async function toggle(row: Webhook) {
  try {
    await api.post(`/notification/${row.id}/updateWebhookStatus`, {
      enabled: row.status !== 'ENABLED',
    })
    await load()
  } catch {
    ElMessage.error('状态更新失败')
  }
}
async function test(row: Webhook) {
  try {
    await api.post(`/notification/${row.id}/testWebhook`)
    ElMessage.success('测试消息发送成功')
  } catch {
    ElMessage.error('连通性测试失败')
  }
}
async function remove(row: Webhook) {
  try {
    await ElMessageBox.confirm(`删除 Webhook“${row.name}”吗？`, '确认删除')
    await api.post(`/notification/${row.id}/deleteWebhook`)
    ElMessage.success('Webhook 已删除')
    await load()
  } catch {
    return
  }
}
onMounted(load)
</script>
<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">FEISHU DELIVERY</span>
        <h2>系统设置</h2>
        <p>管理全局兜底和品种 Webhook，敏感地址只以脱敏形式展示。</p>
      </div>
      <el-button v-if="session.can('notification:create')" type="primary" @click="openCreate">
        新增 Webhook
      </el-button>
    </div>
    <div class="setting-switch">
      <div>
        <strong>通知总开关</strong><small>关闭后所有待发送任务保留，恢复后继续投递。</small>
      </div>
      <el-switch
        v-model="masterEnabled"
        :disabled="!session.can('notification:update')"
        @change="toggleMaster"
      />
    </div>
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="name" label="名称" min-width="150" />
      <el-table-column label="范围" width="100"
        ><template #default="s">{{ displayCode(s.row.scopeType) }}</template></el-table-column
      >
      <el-table-column label="品种" min-width="120">
        <template #default="s">
          {{
            s.row.productCode
              ? productOptions.find((item) => item.code === s.row.productCode)?.name ||
                s.row.productCode
              : '全部品种'
          }}
          <small v-if="s.row.productCode">{{ s.row.productCode }}</small>
        </template>
      </el-table-column>
      <el-table-column prop="maskedUrl" label="Webhook" min-width="250" />
      <el-table-column label="状态" width="100"
        ><template #default="s">{{ displayCode(s.row.status) }}</template></el-table-column
      >
      <el-table-column label="更新时间" min-width="185">
        <template #default="s">{{ formatDateTime(s.row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240">
        <template #default="scope">
          <el-button v-if="session.can('notification:update')" link @click="openEdit(scope.row)"
            >编辑</el-button
          >
          <el-button v-if="session.can('notification:update')" link @click="toggle(scope.row)">
            {{ scope.row.status === 'ENABLED' ? '停用' : '启用' }}
          </el-button>
          <el-button v-if="session.can('notification:test')" link @click="test(scope.row)"
            >测试</el-button
          >
          <el-button
            v-if="session.can('notification:update')"
            link
            type="danger"
            @click="remove(scope.row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </section>
  <el-dialog v-model="dialog" :title="editingId ? '编辑 Webhook' : '新增 Webhook'" width="560px">
    <el-form label-width="110px">
      <el-form-item label="范围">
        <el-select v-model="form.scopeType" :disabled="Boolean(editingId)">
          <el-option v-if="session.user?.role === 'SUPER_ADMIN'" label="全局兜底" value="GLOBAL" />
          <el-option label="指定品种" value="PRODUCT" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.scopeType === 'PRODUCT'" label="品种">
        <el-select
          v-model="form.productCode"
          filterable
          :disabled="Boolean(editingId)"
          placeholder="请选择品种"
          style="width: 100%"
        >
          <el-option
            v-for="item in productOptions"
            :key="item.code"
            :label="`${item.name} · ${item.code}`"
            :value="item.code"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="Webhook 地址"
        ><el-input v-model="form.webhookUrl" type="textarea"
      /></el-form-item>
      <el-form-item label="签名密钥"
        ><el-input v-model="form.signingSecret" type="password" show-password
      /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
