<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useSessionStore } from '@/stores/session'

const loginName = ref('')
const password = ref('')
const store = useSessionStore()
const router = useRouter()

async function submit() {
  try {
    await store.login(loginName.value, password.value)
    await router.push(store.user?.mustChangePassword ? '/change-password' : '/overview')
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      ElMessage.error('登录尝试过于频繁，请稍后重试')
    } else if (axios.isAxiosError(error) && error.response?.status === 503) {
      ElMessage.error('登录服务暂不可用，请稍后重试')
    } else {
      ElMessage.error('账号或密码错误')
    }
  }
}
</script>

<template>
  <div class="login-page">
    <section class="login-story">
      <span class="eyebrow">FINANCE CLOUD</span>
      <h1>让每一根行情<br />都有迹可循</h1>
      <p>从已收盘 K 线到策略信号，从断网恢复到飞书投递，统一掌握关键状态。</p>
    </section>
    <el-form class="login-card" @submit.prevent="submit">
      <span class="eyebrow">TEAM ACCESS</span>
      <h2>登录金融云</h2>
      <p>使用管理员创建的团队账号</p>
      <el-form-item label="账号或手机号"
        ><el-input v-model="loginName" size="large" autocomplete="username"
      /></el-form-item>
      <el-form-item label="密码"
        ><el-input
          v-model="password"
          size="large"
          type="password"
          show-password
          autocomplete="current-password"
      /></el-form-item>
      <el-button type="primary" native-type="submit" size="large" :loading="store.loading"
        >进入工作台</el-button
      >
    </el-form>
  </div>
</template>
