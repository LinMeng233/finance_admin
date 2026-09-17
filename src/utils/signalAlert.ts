import { contractChineseLabel } from '@/utils/contract'

const pendingUtterances = new Set<SpeechSynthesisUtterance>()

export interface SignalAlert {
  id: string
  strategyName: string
  productCode: string
  productName?: string
  contract: string
  timeframe: string
  signalType: string
  closePrice: string
  barStart: string
  createdAt: string
  sourcePhase: string
}

const ruleNames: Record<string, string> = {
  SMA_CROSS: '双均线交叉信号',
  MA5_MA20_ANY: '五日与二十日均线交叉信号',
  MA5_MA20_UP: '金叉买点',
  MA5_MA20_DOWN: '死叉卖点',
  MA5_MA20_STRONG_UP: '强势金叉买点',
  MA5_MA20_STRONG_DOWN: '强势死叉卖点',
  MACD_FIRST_UP: '平滑异同移动平均线首次金叉买点',
  MACD_FIRST_DOWN: '平滑异同移动平均线首次死叉卖点',
  COMBINATION_UP: '多头组合买点',
  COMBINATION_DOWN: '空头组合卖点',
  MA_CROSS_UP: '金叉买点',
  MA_CROSS_DOWN: '死叉卖点',
  MA_STRONG_CROSS_UP: '强势金叉买点',
  MA_STRONG_CROSS_DOWN: '强势死叉卖点',
  MACD_FIRST_CROSS_UP: '平滑异同移动平均线首次金叉买点',
  MACD_FIRST_CROSS_DOWN: '平滑异同移动平均线首次死叉卖点',
  COMBINATION_CROSS_UP: '多头组合买点',
  COMBINATION_CROSS_DOWN: '空头组合卖点',
  COMPOSITE_UP: '组合条件买点',
  COMPOSITE_DOWN: '组合条件卖点',
}

export function signalTypeLabel(type: string): string {
  return ruleNames[type] || type
}

export function signalAnnouncement(alert: SignalAlert, productName?: string) {
  const name = alert.productName || productName || '品种'
  const contract = contractChineseLabel(
    /[\u3400-\u9fff]/.test(name) ? name : '品种',
    alert.contract,
  )
  const period =
    alert.timeframe === 'D'
      ? '日线'
      : alert.timeframe === '1h'
        ? '60分钟'
        : /^\d+(?:min|m)$/.test(alert.timeframe)
          ? `${parseInt(alert.timeframe, 10)}分钟`
          : '指定周期'
  return `${contract} ${period}出现${ruleNames[alert.signalType] || '策略信号'}`
}

export function speakSignal(text: string) {
  if (!('speechSynthesis' in window)) return
  const synthesis = window.speechSynthesis
  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(
      text.replace(/(\d{3,4}) (\d+分钟|日线)/, '$1，$2'),
    )
    const chineseVoice = synthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith('zh-cn'))
    if (chineseVoice) utterance.voice = chineseVoice
    utterance.lang = chineseVoice?.lang ?? 'zh-CN'
    utterance.rate = 1
    pendingUtterances.add(utterance)
    utterance.onend = () => {
      pendingUtterances.delete(utterance)
    }
    utterance.onerror = () => {
      pendingUtterances.delete(utterance)
    }
    synthesis.resume()
    synthesis.speak(utterance)
  }
  if (synthesis.getVoices().length) {
    speak()
    return
  }
  let started = false
  const start = () => {
    if (started) return
    started = true
    synthesis.removeEventListener('voiceschanged', start)
    speak()
  }
  synthesis.addEventListener('voiceschanged', start)
  window.setTimeout(start, 1200)
}
