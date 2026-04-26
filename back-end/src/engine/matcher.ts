import { nanoid } from 'nanoid'
import type { Order, Trade } from '../types.js'
import { findById } from '../store/users.js'
import {
  getBook,
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
  const book = getBook(taker.symbol, opposite)
  const trades: Trade[] = []
  const touched = new Set<Order>([taker])
  const users = new Set<string>([taker.userId])
  const takerUser = findById(taker.userId)!

  // 用游标遍历挂单簿：遇到同用户的 maker 可以跳过而不出簿（防自成交）。
  // 簿是有序的，一旦遇到价格不再交叉就可以直接停止。
  let i = 0
  while (taker.filledQty < taker.qty && i < book.length) {
    const maker = book[i]!
    const crosses =
      taker.side === 'buy'
        ? maker.priceCents <= taker.priceCents
        : maker.priceCents >= taker.priceCents
    if (!crosses) break
    if (maker.userId === taker.userId) {
      i++
      continue
    }

    const fillQty = Math.min(taker.qty - taker.filledQty, maker.qty - maker.filledQty)
    const fillPrice = maker.priceCents
    const makerUser = findById(maker.userId)!

    if (taker.side === 'buy') {
      // 买方是 taker，卖方是 maker。
      const slack = (taker.priceCents - fillPrice) * fillQty
      if (slack > 0) releaseCash(takerUser, slack)
      spendFrozenCash(takerUser, fillPrice * fillQty)
      receiveShares(takerUser, taker.symbol, fillQty, fillPrice * fillQty)
      deliverShares(makerUser, taker.symbol, fillQty)
      makerUser.cashCents += fillPrice * fillQty
    } else {
      // 买方是 maker，卖方是 taker。
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
      book.splice(i, 1) // maker 完全成交后出簿；游标停在 i 不前进
    }
    // 部分成交的 maker 保持原位置；游标仅在上面的同用户跳过分支前进，
    // 否则循环依靠"价格不再交叉"或"簿空"来终止。
  }

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
