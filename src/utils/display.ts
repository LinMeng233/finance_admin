const labels: Record<string, string> = {
  ACTIVE: '运行中',
  ARCHIVED: '已归档',
  DISABLED: '已停用',
  ENABLED: '已启用',
  ERROR: '异常',
  FAILED: '失败',
  GLOBAL: '全局',
  HEALTHY: '正常',
  HEALTH_CHECK: '健康检查',
  HISTORY: '历史补录',
  IGNORED: '已忽略',
  LIVE: '实时',
  OPEN: '待处理',
  PAUSED: '已暂停',
  PENDING: '待处理',
  PROCESSING: '处理中',
  PRODUCT: '品种',
  CONTRACT: '合约',
  COOLDOWN: '冷却抑制',
  RECOVERING: '恢复中',
  RECOVERY: '历史恢复',
  RESOLVED: '已解决',
  REVISION: '数据修订',
  SENT: '已推送',
  SKIPPED: '已跳过',
  STALE: '心跳超时',
  SUCCESS: '成功',
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  MEMBER: '普通成员',
  NORMAL: '正常',
  TASK_FAILURE: '调度失败',
  TRADING: '交易中',
  UNKNOWN: '暂无数据',
  WARNING: '预警',
  EXPIRED: '已到期',
  WEBHOOK: 'Webhook',
  collector: '行情采集器',
  'latest-bar': '最近 K 线',
}

export function displayCode(value: string | null | undefined): string {
  if (!value) return '—'
  return labels[value] ?? value
}

export function displayTimeframe(value: string | null | undefined): string {
  if (!value) return '—'
  if (value === 'D') return '日线'
  if (value === '1h') return '60 分钟'
  const minutes = /^(\d+)(?:min|m)$/.exec(value)
  return minutes ? `${minutes[1]} 分钟` : value
}

export function displayNumber(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? numeric.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
    : '—'
}
