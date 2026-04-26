// 金额/比例/时间格式化工具集。后端的金额单位均为"分"。

export function fmtMoneyCents(cents: number): string {
  // 元，保留两位小数；带千分位。
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fmtPriceCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

// 涨跌幅：(last - prev) / prev，prev 为 0 时返回 0。
export function pctChange(lastCents: number, prevCents: number): number {
  if (prevCents <= 0) return 0
  return (lastCents - prevCents) / prevCents
}

export function fmtPct(x: number): string {
  const sign = x > 0 ? '+' : ''
  return `${sign}${(x * 100).toFixed(2)}%`
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function orderStatusLabel(s: string): string {
  switch (s) {
    case 'open':
      return '未成交'
    case 'partial':
      return '部分成交'
    case 'filled':
      return '已成交'
    case 'canceled':
      return '已撤销'
    default:
      return s
  }
}
