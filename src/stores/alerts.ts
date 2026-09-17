import { defineStore } from 'pinia'
import { ElNotification } from 'element-plus'
import { api, type ApiResult } from '@/api/client'
import { signalAnnouncement, speakSignal, type SignalAlert } from '@/utils/signalAlert'

function readIds(key: string): string[] | null {
  const value = localStorage.getItem(key)
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : null
  } catch {
    return null
  }
}

export const useAlertStore = defineStore('alerts', {
  state: () => ({
    alerts: [] as SignalAlert[],
    knownIds: [] as string[],
    cursorId: '0',
    primed: false,
    readIds: [] as string[],
    productNames: {} as Record<string, string>,
    catalogLoaded: false,
    refreshing: false,
    userId: '',
    voiceEnabled: localStorage.getItem('finance-voice-alerts') !== 'off',
  }),
  getters: {
    unreadCount: (state) =>
      state.alerts.filter((alert) => !state.readIds.includes(alert.id)).length,
  },
  actions: {
    initialize(userId: string) {
      if (this.userId === userId) return
      this.userId = userId
      this.alerts = []
      this.cursorId = localStorage.getItem(`finance-alert-cursor:${userId}`) ?? '0'
      this.primed = false
      this.catalogLoaded = false
      this.productNames = {}
      this.knownIds = readIds(`finance-alert-known:${userId}`) ?? []
      this.readIds = readIds(`finance-alert-read:${userId}`) ?? []
    },
    markRead(id: string) {
      if (!this.readIds.includes(id)) {
        this.readIds = [id, ...this.readIds].slice(0, 1000)
        localStorage.setItem(`finance-alert-read:${this.userId}`, JSON.stringify(this.readIds))
      }
    },
    setVoice(enabled: boolean) {
      this.voiceEnabled = enabled
      localStorage.setItem('finance-voice-alerts', enabled ? 'on' : 'off')
      if (enabled) speakSignal('语音告警已开启')
    },
    announce(alert: SignalAlert) {
      const text = signalAnnouncement(alert, this.productNames[alert.productCode])
      if (this.voiceEnabled) speakSignal(text)
      ElNotification({ title: '新告警', message: text, type: 'warning', duration: 8000 })
    },
    replay(alert: SignalAlert) {
      speakSignal(signalAnnouncement(alert, this.productNames[alert.productCode]))
    },
    async refresh() {
      if (!this.userId || this.refreshing) return
      this.refreshing = true
      try {
        if (!this.catalogLoaded) {
          try {
            const instruments = await api.get<
              ApiResult<{ instruments: Array<{ productCode: string; productName: string }> }>
            >('/market/listInstruments', { params: { pageNo: 1, pageSize: 100 } })
            this.productNames = Object.fromEntries(
              instruments.data.data.instruments.map((item) => [item.productCode, item.productName]),
            )
          } catch {
            // 无行情目录权限时仍显示合约代码并提醒。
          }
          this.catalogLoaded = true
        }
        if (!this.primed) {
          const latest = await api.get<ApiResult<SignalAlert[]>>('/signal/getNotificationFeed', {
            params: { afterId: '0', limit: 100 },
          })
          this.alerts = latest.data.data
          this.primed = true
          if (localStorage.getItem(`finance-alert-cursor:${this.userId}`) === null) {
            this.cursorId = this.alerts.reduce(
              (max, alert) => (BigInt(alert.id) > BigInt(max) ? alert.id : max),
              '0',
            )
            localStorage.setItem(`finance-alert-cursor:${this.userId}`, this.cursorId)
            this.knownIds = this.alerts.map((alert) => alert.id)
            localStorage.setItem(
              `finance-alert-known:${this.userId}`,
              JSON.stringify(this.knownIds),
            )
            return
          }
        }
        const feed = await api.get<ApiResult<SignalAlert[]>>('/signal/getNotificationFeed', {
          params: { afterId: this.cursorId, limit: 100 },
        })
        const fresh = feed.data.data.filter((alert) => !this.knownIds.includes(alert.id))
        if (feed.data.data.length) {
          this.cursorId = feed.data.data.at(-1)!.id
          localStorage.setItem(`finance-alert-cursor:${this.userId}`, this.cursorId)
          this.knownIds = [
            ...new Set([...feed.data.data.map((alert) => alert.id), ...this.knownIds]),
          ].slice(0, 1000)
          localStorage.setItem(`finance-alert-known:${this.userId}`, JSON.stringify(this.knownIds))
          this.alerts = [...feed.data.data.slice().reverse(), ...this.alerts]
            .filter((alert, index, all) => all.findIndex((item) => item.id === alert.id) === index)
            .slice(0, 100)
        }
        for (const alert of fresh) this.announce(alert)
      } finally {
        this.refreshing = false
      }
    },
  },
})
