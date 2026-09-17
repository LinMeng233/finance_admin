<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const busy = ref(false)
const session = useSessionStore()
const router = useRouter()

async function submit() {
  if (!oldPassword.value) {
    ElMessage.error('请输入原密码')
    return
  }
  const passwordBytes = new TextEncoder().encode(newPassword.value).length
  if (newPassword.value.length < 12 || passwordBytes > 72) {
    ElMessage.error('新密码至少 12 个字符，且不能超过 72 字节')
    return
  }
  if (newPassword.value === oldPassword.value) {
    ElMessage.error('新密码不能与原密码相同')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }
  busy.value = true
  try {
    await api.post('/auth/changePassword', {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
    })
    session.clear()
    ElMessage.success('密码已修改，请重新登录')
    await router.push('/login')
  } catch (error) {
    const message = axios.isAxiosError<ApiResult<unknown>>(error)
      ? error.response?.data?.message
      : undefined
    ElMessage.error(message || '修改密码失败，请稍后重试')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="content-card">
    <h2>修改初始密码</h2>
    <p>首次登录需要修改管理员初始密码。修改后请重新登录。</p>
    <el-form style="max-width: 420px" @submit.prevent="submit">
      <el-form-item label="原密码">
        <el-input
          v-model="oldPassword"
          type="password"
          show-password
          autocomplete="current-password"
        />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="newPassword" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码">
        <el-input
          v-model="confirmPassword"
          type="password"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>
      <p class="password-hint">新密码至少 12 个字符、最多 72 字节，且不能与原密码相同。</p>
      <el-button type="primary" native-type="submit" :loading="busy">确认修改</el-button>
    </el-form>
  </section>
</template>

<style scoped>
.password-hint {
  margin: -4px 0 18px;
  color: #9b8877;
  font-size: 13px;
}
</style>
