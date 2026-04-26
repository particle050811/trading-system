import ProperSkipList from 'proper-skip-list'
import type { Order, Trade } from '../types.js'
import {
  appendNode,
  createLevel,
  levelToArray,
  unlinkNode,
  type PriceLevel,
} from './dlist.js'

// 挂单簿改为「价格 → 同价 FIFO 链表」的跳表索引：
//   - 价格优先：跳表按 priceCents 排序，买盘从最大键往下走，卖盘从最小键往上走
//   - 时间优先：同价位用侵入式双向链表 FIFO，head 是最早挂入的
// 三方库 proper-skip-list 提供 O(log n) 的 upsert/find/delete 与
// findEntriesFromMin / findEntriesFromMax 双向遍历；
// 链表把"撤单 / maker 完全成交出簿"从 O(n) 降到 O(1)。
type Book = ProperSkipList<number, PriceLevel>

const bids = new Map<string, Book>()
const asks = new Map<string, Book>()

const ordersById = new Map<string, Order>()
const ordersByUser = new Map<string, Order[]>()

const trades: Trade[] = []
const tradesByUser = new Map<string, Trade[]>()

function bookFor(symbol: string, side: 'buy' | 'sell'): Book {
  const map = side === 'buy' ? bids : asks
  let list = map.get(symbol)
  if (!list) {
    list = new ProperSkipList<number, PriceLevel>()
    map.set(symbol, list)
  }
  return list
}

// 取指定股票/方向的挂单簿底层跳表，撮合引擎按价格优先方向遍历。
export function getBookList(symbol: string, side: 'buy' | 'sell'): Book {
  return bookFor(symbol, side)
}

// 兼容原 API：把跳表内全部挂单按「价格优先 + 时间优先」展开成数组，
// 仅供单测或公开查询使用，撮合热路径请走 getBookList。
export function getBook(symbol: string, side: 'buy' | 'sell'): Order[] {
  const list = bookFor(symbol, side)
  const iter = side === 'buy' ? list.findEntriesFromMax() : list.findEntriesFromMin()
  const out: Order[] = []
  for (const [, level] of iter) out.push(...levelToArray(level))
  return out
}

// 把一笔未完全成交的订单挂入挂单簿：找到/新建价格档的 FIFO，追加到链表尾部。O(log n)。
export function insertResting(order: Order): void {
  const list = bookFor(order.symbol, order.side)
  let level = list.find(order.priceCents)
  if (!level) {
    level = createLevel()
    list.upsert(order.priceCents, level)
  }
  appendNode(level, order)
}

// 从挂单簿移除指定订单（撤单或完全成交时调用）。
// 侵入式链表 O(1) 解链；解完若整档为空则从跳表里删除该价格键，保证结构紧凑。
export function removeResting(order: Order): void {
  const list = bookFor(order.symbol, order.side)
  const level = list.find(order.priceCents)
  if (!level) return
  unlinkNode(level, order)
  if (level.size === 0) list.delete(order.priceCents)
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

// 仅供单测用：在 beforeEach 里把全部内存状态清空，避免用例之间相互污染。
// 不导出给业务路径调用——名字带 __ 前缀作为肉眼可见的提示。
export function __resetForTests(): void {
  bids.clear()
  asks.clear()
  ordersById.clear()
  ordersByUser.clear()
  trades.length = 0
  tradesByUser.clear()
}
