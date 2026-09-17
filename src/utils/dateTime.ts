const chinaTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** 页面时间统一为北京时间；天勤返回的无时区行情时间已是本地时间。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const instant = new Date(value)
    if (Number.isNaN(instant.getTime())) return '—'
    const parts = Object.fromEntries(
      chinaTime.formatToParts(instant).map(({ type, value }) => [type, value]),
    )
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
  }
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(value)
  return local ? `${local[1]} ${local[2]}` : '—'
}
