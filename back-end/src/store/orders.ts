import type { Order, Trade } from '../types.js'

// 按股票代码分别维护的挂单簿。买盘按价格降序、卖盘按价格升序；
// 同价位按 createdAt 升序（时间优先）。
const bids = new Map<string, Order[]>()
const asks = new Map<string, Order[]>()

const ordersById = new Map<string, Order>()
const ordersByUser = new Map<string, Order[]>()

const trades: Trade[] = []
const tradesByUser = new Map<string, Trade[]>()

function bookFor(symbol: string, side: 'buy' | 'sell'): Order[] {
  const map = side === 'buy' ? bids : asks
  let arr = map.get(symbol)
  if (!arr) {
    arr = []
    map.set(symbol, arr)
  }
  return arr
}

// 取指定股票、指定方向的挂单簿数组（按价格优先 + 时间优先排好序）。
export function getBook(symbol: string, side: 'buy' | 'sell'): Order[] {
  return bookFor(symbol, side)
}

// 把一笔未完全成交的订单挂入挂单簿，使用二分插入维持排序不变量。
export function insertResting(order: Order): void {
  const arr = bookFor(order.symbol, order.side)
  // 排序规则：买盘价高优先、卖盘价低优先；同价按 createdAt 升序作为次序。
  const cmp = (a: Order, b: Order) => {
    if (a.priceCents !== b.priceCents) {
      return order.side === 'buy' ? b.priceCents - a.priceCents : a.priceCents - b.priceCents
    }
    return a.createdAt - b.createdAt
  }
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cmp(arr[mid]!, order) <= 0) lo = mid + 1
    else hi = mid
  }
  arr.splice(lo, 0, order)
}

// 从挂单簿移除指定订单（撤单或完全成交时调用）。
export function removeResting(order: Order): void {
  const arr = bookFor(order.symbol, order.side)
  const idx = arr.indexOf(order)
  if (idx >= 0) arr.splice(idx, 1)
}

// 把新订单写入按 ID / 按用户两个索引，便于后续查询和按用户列表展示。
export function indexOrder(order: Order): void {
  ordersById.set(order.id, order)
  let arr = ordersByUser.get(order.userId)
  if (!arr) {
    arr = []
    ordersByUser.set(order.userId, arr)
  }
  arr.push(order)
}

// 按订单 ID 取订单（撤单接口、撮合内查找都用它）。
export function getOrder(id: string): Order | undefined {
  return ordersById.get(id)
}

// 列出某个用户的全部委托（含已成交、已撤单的历史）。
export function listUserOrders(userId: string): Order[] {
  return ordersByUser.get(userId) ?? []
}

// 记录一笔成交：写入全局历史和买卖双方各自的历史，各自最多保留 500 条。
export function recordTrade(trade: Trade): void {
  trades.unshift(trade)
  if (trades.length > 500) trades.length = 500
  // 用 Set 去重：自成交（买卖同一用户）只在该用户历史里记一次，不重复。
  const uids = new Set([trade.buyUserId, trade.sellUserId])
  for (const uid of uids) {
    let arr = tradesByUser.get(uid)
    if (!arr) {
      arr = []
      tradesByUser.set(uid, arr)
    }
    arr.unshift(trade)
    if (arr.length > 500) arr.length = 500
  }
}

// 列出全市场最近的成交（用于"成交记录"公开面板）。
export function listRecentTrades(limit = 50): Trade[] {
  return trades.slice(0, limit)
}

// 列出指定用户最近的成交记录（"我的成交"面板）。
export function listUserTrades(userId: string, limit = 50): Trade[] {
  return (tradesByUser.get(userId) ?? []).slice(0, limit)
}
