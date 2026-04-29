// 成交弹窗通知：基于 Element Plus ElNotification。
//
// 设计要点：
// - 区分「自己的成交」与「他人成交」：自己用 success/warning 强提示并停留更久，他人不弹（避免噪音）。
//   如需打开全市场广播提示，把 NOTIFY_OTHERS 改 true 即可。
// - 去重：用 Set 记录最近 200 个 trade.id，避免快照重放或同 id 重复推送时重弹。
// - 限流：同时最多保留 MAX_VISIBLE 条，超出时关闭最早的一条。
// - 用户开关：localStorage 'tradeNotifyEnabled'，关闭则全部静默。

import { ElNotification, type NotificationHandle } from 'element-plus'
import type { Trade } from '@/types'
import { fmtPriceCents, fmtTime } from './format'

const NOTIFY_OTHERS = false
const MAX_VISIBLE = 4
const DEDUP_CAP = 200

const seen = new Set<string>()
const seenQueue: string[] = []
const visible: NotificationHandle[] = []

function rememberId(id: string): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  seenQueue.push(id)
  if (seenQueue.length > DEDUP_CAP) {
    const old = seenQueue.shift()
    if (old) seen.delete(old)
  }
  return true
}

function pushVisible(handle: NotificationHandle): void {
  visible.push(handle)
  while (visible.length > MAX_VISIBLE) {
    const oldest = visible.shift()
    oldest?.close()
  }
}

export function isTradeNotifyEnabled(): boolean {
  return localStorage.getItem('tradeNotifyEnabled') !== '0'
}

export function setTradeNotifyEnabled(enabled: boolean): void {
  localStorage.setItem('tradeNotifyEnabled', enabled ? '1' : '0')
}

export interface NotifyOptions {
  trade: Trade
  currentUserId: string
  // silent=true 时只把 id 灌入去重集合，不弹窗。用于 snapshot 重连回放，
  // 避免历史成交集中弹一堆，又能让随后的同 id 增量被去重吞掉。
  silent?: boolean
}

// 收到一条成交时调用；返回是否真正弹了通知（便于测试/调试）。
export function notifyTrade(opts: NotifyOptions): boolean {
  if (!isTradeNotifyEnabled()) return false
  const { trade, currentUserId, silent = false } = opts
  if (!rememberId(trade.id)) return false
  if (silent) return false

  const isBuyer = !!currentUserId && trade.buyUserId === currentUserId
  const isSeller = !!currentUserId && trade.sellUserId === currentUserId
  // 撮合引擎已禁止同一用户自成交（back-end/src/engine/matcher.ts），
  // 故 isBuyer && isSeller 实际不会触发，这里只按互斥两种情况判断。
  const isSelf = isBuyer || isSeller

  if (!isSelf && !NOTIFY_OTHERS) return false

  const side = isBuyer ? '买入' : isSeller ? '卖出' : '成交'
  const title = isSelf ? `成交通知 · ${side}` : `市场成交 · ${trade.symbol}`
  const amount = ((trade.priceCents * trade.qty) / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const message =
    `${trade.symbol}  ${trade.qty} 股 @ ¥${fmtPriceCents(trade.priceCents)}\n` +
    `金额 ¥${amount}  ·  ${fmtTime(trade.ts)}`

  const handle = ElNotification({
    title,
    message,
    type: isBuyer ? 'success' : isSeller ? 'warning' : 'info',
    duration: isSelf ? 5000 : 3000,
    position: 'top-right',
    showClose: true,
    customClass: 'trade-toast',
  })
  pushVisible(handle)
  return true
}

// 登出/切换账号时清空状态，避免上个用户的去重集合误伤新用户。
export function resetTradeNotifier(): void {
  seen.clear()
  seenQueue.length = 0
  for (const h of visible) h.close()
  visible.length = 0
}
