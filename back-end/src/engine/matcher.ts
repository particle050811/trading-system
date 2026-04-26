import { nanoid } from 'nanoid'
import type { Order, Trade } from '../types.js'
import { findById } from '../store/users.js'
import {
  getBookList,
  insertResting,
  recordTrade,
  removeResting,
} from '../store/orders.js'
import {
  deliverShares,
  receiveShares,
  releaseCash,
  releaseShares,
  spendFrozenCash,
} from '../store/reservation.js'
import { setLastPrice } from '../store/stocks.js'

export interface MatchResult {
  trades: Trade[]
  // taker 加上所有被触及的对手挂单。taker 始终排在第一位，方便调用方
  // 单独处理（例如优先推送给下单者）。
  affectedOrders: Order[]
  affectedUserIds: Set<string>
}

// 把刚提交的 taker 订单与对手挂单簿撮合。下单时已按 taker 自己的限价
// 冻结了现金（买）或股票（卖）。每笔成交按挂单方（maker，被动方）的价格成交；
// 买单 taker 因此可能拿到比限价更优的成交价，差额 (limit - fill) * qty
// 在扣款前先 releaseCash 退回到可用资金。
export function matchOrder(taker: Order): MatchResult {
  const opposite = taker.side === 'buy' ? 'sell' : 'buy'
  const book = getBookList(taker.symbol, opposite)
  // 买 taker 走对手卖盘，从最低价升序遍历；卖 taker 走对手买盘，从最高价降序遍历。
  const iter = taker.side === 'buy' ? book.findEntriesFromMin() : book.findEntriesFromMax()
  const trades: Trade[] = []
  const touched = new Set<Order>([taker])
  const users = new Set<string>([taker.userId])
  const takerUser = findById(taker.userId)!
  // 跳表迭代过程中删除当前键会破坏 next/prev 指针，留到循环结束统一清理。
  const emptiedPrices: number[] = []

  outer: for (const [price, level] of iter) {
    const crosses =
      taker.side === 'buy' ? price <= taker.priceCents : price >= taker.priceCents
    if (!crosses) break

    // 同价档 FIFO 队列：游标 j 从队首推进，体现时间优先；同用户 maker 跳过不出簿，
    // maker 完全成交则原地 splice，j 不前进。
    let j = 0
    while (taker.filledQty < taker.qty && j < level.length) {
      const maker = level[j]!
      if (maker.userId === taker.userId) {
        j++
        continue
      }

      const fillQty = Math.min(taker.qty - taker.filledQty, maker.qty - maker.filledQty)
      const fillPrice = maker.priceCents
      const makerUser = findById(maker.userId)!

      if (taker.side === 'buy') {
        const slack = (taker.priceCents - fillPrice) * fillQty
        if (slack > 0) releaseCash(takerUser, slack)
        spendFrozenCash(takerUser, fillPrice * fillQty)
        receiveShares(takerUser, taker.symbol, fillQty, fillPrice * fillQty)
        deliverShares(makerUser, taker.symbol, fillQty)
        makerUser.cashCents += fillPrice * fillQty
      } else {
        spendFrozenCash(makerUser, fillPrice * fillQty)
        receiveShares(makerUser, taker.symbol, fillQty, fillPrice * fillQty)
        deliverShares(takerUser, taker.symbol, fillQty)
        takerUser.cashCents += fillPrice * fillQty
      }

      taker.filledQty += fillQty
      maker.filledQty += fillQty
      taker.status = taker.filledQty === taker.qty ? 'filled' : 'partial'
      maker.status = maker.filledQty === maker.qty ? 'filled' : 'partial'

      const buyOrder = taker.side === 'buy' ? taker : maker
      const sellOrder = taker.side === 'buy' ? maker : taker
      const trade: Trade = {
        id: nanoid(),
        symbol: taker.symbol,
        priceCents: fillPrice,
        qty: fillQty,
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id,
        buyUserId: buyOrder.userId,
        sellUserId: sellOrder.userId,
        ts: Date.now(),
      }
      trades.push(trade)
      recordTrade(trade)
      setLastPrice(taker.symbol, fillPrice)

      touched.add(maker)
      users.add(maker.userId)

      if (maker.status === 'filled') {
        level.splice(j, 1) // maker 出簿，游标停在 j 不前进
      }
    }

    if (level.length === 0) emptiedPrices.push(price)
    if (taker.filledQty === taker.qty) break outer
  }

  for (const p of emptiedPrices) book.delete(p)

  if (taker.filledQty < taker.qty) {
    insertResting(taker)
    if (taker.status !== 'partial') taker.status = 'open'
  }

  return { trades, affectedOrders: Array.from(touched), affectedUserIds: users }
}

// 撤销一笔挂单（open 或 partial 状态）：从簿移除，并把未成交部分的
// 冻结资金/股票释放回用户。已成交或已撤销的订单返回 false。
export function cancelOrder(order: Order): boolean {
  if (order.status === 'filled' || order.status === 'canceled') return false
  const remaining = order.qty - order.filledQty
  removeResting(order)
  order.status = 'canceled'
  if (remaining <= 0) return true
  const user = findById(order.userId)
  if (!user) return true
  if (order.side === 'buy') {
    releaseCash(user, order.priceCents * remaining)
  } else {
    releaseShares(user, order.symbol, remaining)
  }
  return true
}
