<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { formatDateTime } from '@/utils/dateTime'
import { displayCode } from '@/utils/display'
import { useSessionStore } from '@/stores/session'

interface UserRow {
  userId: string
  username: string
  phone: string | null
  roleCode: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER'
  status: 'ENABLED' | 'DISABLED'
  mustChangePassword: boolean
  createdAt: string
}

interface UserPage {
  total: number
  users: UserRow[]
}

const session = useSessionStore()
const loading = ref(false)
const creating = ref(false)
const createDialog = ref(false)
const pageNo = ref(1)
const total = ref(0)
const users = ref<UserRow[]>([])
const filters = reactive({ username: '', roleCode: '', status: '' })
const form = reactive({
  username: '',
  phone: '',
  password: '',
  roleCode: 'MEMBER',
  status: 'ENABLED',
})

async function load() {
  loading.value = true
  try {
    const response = await api.get<ApiResult<UserPage>>('/user/listUsers', {
      params: {
        pageNo: pageNo.value,
        pageSize: 20,
        username: filters.username || undefined,
        roleCode: filters.roleCode || undefined,
        status: filters.status || undefined,
      },
    })
    users.value = response.data.data.users
    total.value = response.data.data.total
  } catch {
    ElMessage.error('用户列表加载失败')
  } finally {
    loading.value = false
  }
}

function search() {
  pageNo.value = 1
  void load()
}

async function createUser() {
  creating.value = true
  try {
    await api.post('/user/createUser', {
      username: form.username,
      phone: form.phone || null,
      password: form.password,
      roleCode: form.roleCode,
      status: form.status,
    })
    createDialog.value = false
    form.username = ''
    form.phone = ''
    form.password = ''
    ElMessage.success('用户已创建')
    await load()
  } catch {
    ElMessage.error('创建失败，请检查字段或是否已存在同名账号')
  } finally {
    creating.value = false
  }
}

function canEdit(row: UserRow): boolean {
  return (
    session.can('user:update') &&
    row.userId !== session.user?.id &&
    row.roleCode !== 'SUPER_ADMIN' &&
    (session.user?.role === 'SUPER_ADMIN' || row.roleCode === 'MEMBER')
  )
}

async function updateStatus(row: UserRow) {
  const status = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  try {
    await ElMessageBox.confirm(
      `确定${status === 'DISABLED' ? '停用' : '启用'}账号 ${row.username} 吗？`,
      '确认操作',
    )
  } catch {
    return
  }
  try {
    await api.post('/user/updateStatus', { userId: row.userId, status })
    ElMessage.success('状态已更新')
    await load()
  } catch {
    ElMessage.error('状态更新失败，请刷新后重试')
  }
}

onMounted(load)
</script>

<template>
  <section class="content-card">
    <h2>用户管理</h2>
    <p>查看团队账号；新建账号首次登录需要修改初始密码。</p>
    <el-form inline @submit.prevent="search">
      <el-form-item label="账号"><el-input v-model="filters.username" clearable /></el-form-item>
      <el-form-item label="角色">
        <el-select v-model="filters.roleCode" clearable style="width: 140px">
          <el-option label="超级管理员" value="SUPER_ADMIN" />
          <el-option label="管理员" value="ADMIN" />
          <el-option label="普通成员" value="MEMBER" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 120px">
          <el-option label="启用" value="ENABLED" />
          <el-option label="停用" value="DISABLED" />
        </el-select>
      </el-form-item>
      <el-button type="primary" native-type="submit">查询</el-button>
      <el-button v-if="session.can('user:create')" @click="createDialog = true">新建用户</el-button>
    </el-form>
    <el-table :data="users" v-loading="loading" stripe>
      <el-table-column prop="userId" label="ID" width="100" />
      <el-table-column prop="username" label="账号" min-width="160" />
      <el-table-column prop="phone" label="手机号" min-width="160" />
      <el-table-column label="角色" width="150"
        ><template #default="s">{{ displayCode(s.row.roleCode) }}</template></el-table-column
      >
      <el-table-column label="状态" width="120"
        ><template #default="s">{{ displayCode(s.row.status) }}</template></el-table-column
      >
      <el-table-column label="创建时间" min-width="220">
        <template #default="s">{{ formatDateTime(s.row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="scope">
          <el-button v-if="canEdit(scope.row)" link type="primary" @click="updateStatus(scope.row)">
            {{ scope.row.status === 'ENABLED' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="pageNo"
      :page-size="20"
      :total="total"
      layout="prev, pager, next, total"
      style="margin-top: 20px"
      @current-change="load"
    />
  </section>

  <el-dialog v-model="createDialog" title="新建用户" width="520px">
    <el-form label-width="90px">
      <el-form-item label="账号"><el-input v-model="form.username" /></el-form-item>
      <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
      <el-form-item label="初始密码">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>
      <p>密码至少 12 字符，UTF-8 编码后不超过 72 字节。</p>
      <el-form-item label="角色">
        <el-select v-model="form.roleCode">
          <el-option label="普通成员" value="MEMBER" />
          <el-option v-if="session.user?.role === 'SUPER_ADMIN'" label="管理员" value="ADMIN" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="form.status">
          <el-option label="启用" value="ENABLED" />
          <el-option label="停用" value="DISABLED" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createDialog = false">取消</el-button>
      <el-button type="primary" :loading="creating" @click="createUser">创建</el-button>
    </template>
  </el-dialog>
</template>
