<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { displayCode } from '@/utils/display'

interface UserRow {
  userId: string
  username: string
  roleCode: string
  status: string
}
interface UserPage {
  total: number
  users: UserRow[]
}
interface Definition {
  permissionType: 'PAGE' | 'FUNCTION'
  permissionCode: string
  permissionName: string
  routePath: string | null
  sortOrder: number
}
interface PageGrant {
  permissionCode: string
  writable: boolean
}
interface PermissionSet {
  userId: string
  pageGrants: PageGrant[]
  functionCodes: string[]
}

const loading = ref(false)
const saving = ref(false)
const users = ref<UserRow[]>([])
const definitions = ref<Definition[]>([])
const selectedUserId = ref('')
const visiblePages = ref<string[]>([])
const writablePages = ref<string[]>([])
const enabledFunctions = ref<string[]>([])
const pageDefinitions = computed(() =>
  definitions.value.filter((item) => item.permissionType === 'PAGE'),
)
const functionDefinitions = computed(() =>
  definitions.value.filter((item) => item.permissionType === 'FUNCTION'),
)

async function initialize() {
  loading.value = true
  try {
    const [definitionResponse, userResponse] = await Promise.all([
      api.get<ApiResult<Definition[]>>('/permission/listDefinitions'),
      api.get<ApiResult<UserPage>>('/user/listUsers', {
        params: { pageNo: 1, pageSize: 100, roleCode: 'MEMBER' },
      }),
    ])
    definitions.value = definitionResponse.data.data
    users.value = userResponse.data.data.users
    if (users.value.length) {
      selectedUserId.value = users.value[0].userId
      await loadGrants()
    }
  } catch {
    ElMessage.error('权限数据加载失败')
  } finally {
    loading.value = false
  }
}

async function loadGrants() {
  if (!selectedUserId.value) return
  loading.value = true
  try {
    const response = await api.get<ApiResult<PermissionSet>>('/permission/getUserPermissions', {
      params: { userId: selectedUserId.value },
    })
    visiblePages.value = response.data.data.pageGrants.map((item) => item.permissionCode)
    writablePages.value = response.data.data.pageGrants
      .filter((item) => item.writable)
      .map((item) => item.permissionCode)
    enabledFunctions.value = [...response.data.data.functionCodes]
  } catch {
    ElMessage.error('用户权限加载失败')
  } finally {
    loading.value = false
  }
}

function toggleVisible(code: string, checked: boolean) {
  if (!checked) writablePages.value = writablePages.value.filter((item) => item !== code)
}

function toggleWritable(code: string, checked: boolean) {
  if (checked && !visiblePages.value.includes(code)) visiblePages.value.push(code)
}

async function save() {
  saving.value = true
  try {
    await api.post('/permission/updateUserPermissions', {
      userId: selectedUserId.value,
      pageGrants: visiblePages.value.map((permissionCode) => ({
        permissionCode,
        writable: writablePages.value.includes(permissionCode),
      })),
      functionCodes: enabledFunctions.value,
    })
    ElMessage.success('权限已保存，下次请求立即生效')
  } catch {
    ElMessage.error('权限保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(initialize)
</script>

<template>
  <section class="content-card" v-loading="loading">
    <div class="page-title">
      <div>
        <span class="eyebrow">ACCESS CONTROL</span>
        <h2>权限配置</h2>
        <p>为普通成员分配页面可见、页面可写和关键操作权限。</p>
      </div>
      <el-button type="primary" :disabled="!selectedUserId" :loading="saving" @click="save">
        保存权限
      </el-button>
    </div>
    <el-form inline class="filters">
      <el-form-item label="普通成员">
        <el-select v-model="selectedUserId" style="width: 240px" @change="loadGrants">
          <el-option
            v-for="user in users"
            :key="user.userId"
            :label="`${user.username} · ${displayCode(user.status)}`"
            :value="user.userId"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template v-if="selectedUserId">
      <h3 class="subheading">页面权限</h3>
      <el-table :data="pageDefinitions" stripe>
        <el-table-column prop="permissionName" label="页面" />
        <el-table-column prop="routePath" label="路由" />
        <el-table-column label="可见" width="120">
          <template #default="scope">
            <el-checkbox
              v-model="visiblePages"
              :value="scope.row.permissionCode"
              @change="(checked: boolean) => toggleVisible(scope.row.permissionCode, checked)"
            />
          </template>
        </el-table-column>
        <el-table-column label="可写" width="120">
          <template #default="scope">
            <el-checkbox
              v-model="writablePages"
              :value="scope.row.permissionCode"
              @change="(checked: boolean) => toggleWritable(scope.row.permissionCode, checked)"
            />
          </template>
        </el-table-column>
      </el-table>
      <h3 class="subheading">功能权限</h3>
      <el-checkbox-group v-model="enabledFunctions" class="permission-grid">
        <el-checkbox
          v-for="item in functionDefinitions"
          :key="item.permissionCode"
          :value="item.permissionCode"
          border
        >
          {{ item.permissionName }}
          <small>{{ item.permissionCode }}</small>
        </el-checkbox>
      </el-checkbox-group>
    </template>
    <div v-else class="empty-state">暂无普通成员，请先创建账号。</div>
  </section>
</template>
