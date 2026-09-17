<script setup lang="ts">
import { computed } from 'vue'
import { useAlertStore } from '@/stores/alerts'
import { signalAnnouncement, speakSignal } from '@/utils/signalAlert'
import { formatDateTime } from '@/utils/dateTime'
import { displayNumber } from '@/utils/display'

const alerts = useAlertStore()
const messages = computed(() => alerts.alerts)
</script>

<template>
  <section class="content-card">
    <div class="page-title">
      <div>
        <span class="eyebrow">USER MESSAGES</span>
        <h2>消息中心</h2>
        <p>最近 100 条策略告警，未读 {{ alerts.unreadCount }} 条。</p>
      </div>
      <div class="message-actions">
        <el-button @click="speakSignal('焦煤二七零一，五分钟出现强势金叉买点')">测试语音</el-button>
        <el-button @click="alerts.refresh()">刷新消息</el-button>
      </div>
    </div>
    <el-empty v-if="!messages.length" description="暂无告警消息" />
    <div
      v-for="item in messages"
      :key="item.id"
      class="message-row"
      :class="{ unread: !alerts.readIds.includes(item.id) }"
    >
      <div>
        <strong>{{ signalAnnouncement(item, alerts.productNames[item.productCode]) }}</strong>
        <p>
          {{ item.strategyName }} · {{ item.contract }} · {{ displayNumber(item.closePrice) }} ·
          {{ formatDateTime(item.barStart) }}
        </p>
      </div>
      <div class="message-actions">
        <el-tag v-if="!alerts.readIds.includes(item.id)" type="warning">未读</el-tag>
        <el-button link @click="alerts.replay(item)">播放</el-button>
        <el-button
          v-if="!alerts.readIds.includes(item.id)"
          link
          type="primary"
          @click="alerts.markRead(item.id)"
          >标为已读</el-button
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.message-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  border-top: 1px solid var(--line);
  padding: 16px 8px;
}
.message-row.unread {
  background: color-mix(in srgb, var(--orange) 7%, transparent);
}
.message-row p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}
.message-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
}
</style>
