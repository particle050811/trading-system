// 撮合引擎单测：覆盖价格优先、时间优先、部分成交、taker 价格改善、
// 自成交跳过、撤单返还冻结资金/股票 等关键不变量。
import { beforeEach, describe, expect, it } from 'vitest'
import { cancelOrder, matchOrder } from './matcher.js'
import { __resetForTests, getBook, indexOrder, listRecentTrades } from '../store/orders.js'
import { createUser, type User } from '../store/users.js'
import { reserveCash, reserveShares } from '../store/reservation.js'
import { getStock } from '../store/stocks.js'
import type { Order, Side } from '../types.js'

const SYM = 'STK001'

let seq = 0

// 直接构造 Order，复刻路由层的下单流程：先冻结资金/持仓，再入索引，再撮合。
function submitOrder(
  user: User,
  side: Side,
  priceCents: number,
  qty: number,
  createdAt: number,
): Order {
  if (side === 'buy') {
    const ok = reserveCash(user, priceCents * qty)
    if (!ok) throw new Error('reserveCash failed in test setup')
  } else {
    const ok = reserveShares(user, SYM, qty)
    if (!ok) throw new Error('reserveShares failed in test setup')
  }
  const order: Order = {
    id: 'o' + ++seq,
    userId: user.id,
    symbol: SYM,
    side,
    priceCents,
    qty,
    filledQty: 0,
    status: 'open',
    createdAt,
  }
  indexOrder(order)
  matchOrder(order)
  return order
}

function makeBuyer(cashCents = 1_000_000_00): User {
  const u = createUser('buyer-' + ++seq, 'pw')
  u.cashCents = cashCents
  u.frozenCashCents = 0
  u.positions.clear()
  return u
}

function makeSeller(symbol: string, qty: number, avgPriceCents: number): User {
  const u = createUser('seller-' + ++seq, 'pw')
  u.cashCents = 0
  u.frozenCashCents = 0
  u.positions.clear()
  u.positions.set(symbol, {
    qty,
    frozenQty: 0,
    totalCostCents: avgPriceCents * qty,
  })
  return u
}

beforeEach(() => {
  __resetForTests()
  seq = 0
})

describe('价格优先', () => {
  it('买方 taker 先吃最低价的卖单', () => {
    const sellerHigh = makeSeller(SYM, 100, 5000)
    const sellerLow = makeSeller(SYM, 100, 5000)
    submitOrder(sellerHigh, 'sell', 5200, 50, 1)
    submitOrder(sellerLow, 'sell', 5100, 50, 2)

    const buyer = makeBuyer(1_000_000_00)
    submitOrder(buyer, 'buy', 5200, 50, 3)

    const trades = listRecentTrades()
    expect(trades).toHaveLength(1)
    // 价格优先：低价的卖方先成交
    expect(trades[0]!.priceCents).toBe(5100)
    expect(trades[0]!.sellUserId).toBe(sellerLow.id)
    expect(trades[0]!.qty).toBe(50)
  })

  it('卖方 taker 先吃最高价的买单', () => {
    const buyerLow = makeBuyer()
    const buyerHigh = makeBuyer()
    submitOrder(buyerLow, 'buy', 4900, 30, 1)
    submitOrder(buyerHigh, 'buy', 5000, 30, 2)

    const seller = makeSeller(SYM, 30, 4500)
    submitOrder(seller, 'sell', 4900, 30, 3)

    const trades = listRecentTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0]!.priceCents).toBe(5000)
    expect(trades[0]!.buyUserId).toBe(buyerHigh.id)
  })
})

describe('时间优先', () => {
  it('同价位下先挂的单先成交', () => {
    const sellerEarly = makeSeller(SYM, 100, 5000)
    const sellerLate = makeSeller(SYM, 100, 5000)
    submitOrder(sellerEarly, 'sell', 5100, 100, 1)
    submitOrder(sellerLate, 'sell', 5100, 100, 2)

    const buyer = makeBuyer()
    submitOrder(buyer, 'buy', 5100, 50, 3)

    const trades = listRecentTrades()
    expect(trades).toHaveLength(1)
    expect(trades[0]!.sellUserId).toBe(sellerEarly.id)
  })
})

describe('部分成交', () => {
  it('taker 量小于 maker：maker 留在簿上为部分成交状态', () => {
    const seller = makeSeller(SYM, 100, 5000)
    const sellOrder = submitOrder(seller, 'sell', 5100, 100, 1)

    const buyer = makeBuyer()
    submitOrder(buyer, 'buy', 5100, 30, 2)

    expect(sellOrder.filledQty).toBe(30)
    expect(sellOrder.status).toBe('partial')
    // 仍在卖盘簿上等待剩余成交
    expect(getBook(SYM, 'sell')).toContain(sellOrder)
  })

  it('taker 量大于簿：吃完所有可吃单，剩余挂入自身方向的簿', () => {
    const seller = makeSeller(SYM, 50, 5000)
    submitOrder(seller, 'sell', 5100, 50, 1)

    const buyer = makeBuyer()
    const buyOrder = submitOrder(buyer, 'buy', 5100, 200, 2)

    expect(buyOrder.filledQty).toBe(50)
    expect(buyOrder.status).toBe('partial')
    // 剩余 150 手挂入买盘
    expect(getBook(SYM, 'buy')).toContain(buyOrder)
  })

  it('多笔 maker 累计成交：游标按价格优先吃完一档继续吃下一档', () => {
    const s1 = makeSeller(SYM, 30, 5000)
    const s2 = makeSeller(SYM, 30, 5000)
    submitOrder(s1, 'sell', 5050, 30, 1)
    submitOrder(s2, 'sell', 5100, 30, 2)

    const buyer = makeBuyer()
    submitOrder(buyer, 'buy', 5100, 60, 3)

    const trades = listRecentTrades()
    expect(trades).toHaveLength(2)
    // 最近成交在前 —— 高价档 5100 应排在低价档 5050 之后产生
    expect(trades[0]!.priceCents).toBe(5100)
    expect(trades[1]!.priceCents).toBe(5050)
  })
})

describe('taker 价格改善（限价差额退回）', () => {
  it('买方限价 5200，吃到 5100 卖单，差额 (100*30=3000) 退回可用资金', () => {
    const seller = makeSeller(SYM, 30, 5000)
    submitOrder(seller, 'sell', 5100, 30, 1)

    const buyer = makeBuyer(1_000_000_00)
    submitOrder(buyer, 'buy', 5200, 30, 2)

    // 实际花费 5100 * 30 = 153000；冻结过 5200*30=156000，差额 3000 应退回
    expect(buyer.cashCents).toBe(1_000_000_00 - 5100 * 30)
    expect(buyer.frozenCashCents).toBe(0)
  })
})

describe('自成交防护', () => {
  it('同一用户的买卖单不会互相成交', () => {
    const u = makeBuyer()
    // 这里同一个用户既挂卖单又挂买单
    u.positions.set(SYM, { qty: 100, frozenQty: 0, totalCostCents: 100 * 5000 })
    submitOrder(u, 'sell', 5100, 50, 1)
    submitOrder(u, 'buy', 5100, 50, 2)

    expect(listRecentTrades()).toHaveLength(0)
    // 两笔单都还挂在簿上
    expect(getBook(SYM, 'sell')).toHaveLength(1)
    expect(getBook(SYM, 'buy')).toHaveLength(1)
  })
})

describe('撤单', () => {
  it('撤销未成交买单：从簿移除并退回冻结资金', () => {
    const buyer = makeBuyer(1_000_000_00)
    const order = submitOrder(buyer, 'buy', 5000, 100, 1)

    expect(buyer.frozenCashCents).toBe(5000 * 100)
    expect(getBook(SYM, 'buy')).toContain(order)

    expect(cancelOrder(order)).toBe(true)
    expect(order.status).toBe('canceled')
    expect(buyer.frozenCashCents).toBe(0)
    expect(buyer.cashCents).toBe(1_000_000_00)
    expect(getBook(SYM, 'buy')).not.toContain(order)
  })

  it('撤销部分成交单：仅返还未成交部分的冻结', () => {
    const seller = makeSeller(SYM, 30, 5000)
    submitOrder(seller, 'sell', 5100, 30, 1)

    const buyer = makeBuyer(1_000_000_00)
    const order = submitOrder(buyer, 'buy', 5100, 100, 2)

    // 30 已成交（按 5100 实扣），70 还冻结在簿上
    expect(order.status).toBe('partial')
    expect(buyer.frozenCashCents).toBe(5100 * 70)

    expect(cancelOrder(order)).toBe(true)
    expect(buyer.frozenCashCents).toBe(0)
    expect(buyer.cashCents).toBe(1_000_000_00 - 5100 * 30)
  })

  it('已成交订单不能撤销', () => {
    const seller = makeSeller(SYM, 30, 5000)
    submitOrder(seller, 'sell', 5100, 30, 1)
    const buyer = makeBuyer()
    const order = submitOrder(buyer, 'buy', 5100, 30, 2)

    expect(order.status).toBe('filled')
    expect(cancelOrder(order)).toBe(false)
  })
})

describe('成交副作用', () => {
  it('成交后股票最新价被更新为成交价', () => {
    const seller = makeSeller(SYM, 10, 5000)
    submitOrder(seller, 'sell', 5123, 10, 1)
    const buyer = makeBuyer()
    submitOrder(buyer, 'buy', 5200, 10, 2)

    expect(getStock(SYM)?.lastPriceCents).toBe(5123)
  })

  it('卖方持仓清零后再次买入，均价不被舍入残值污染', () => {
    const seller = makeSeller(SYM, 10, 5000)
    submitOrder(seller, 'sell', 7777, 10, 1)
    const buyer = makeBuyer()
    submitOrder(buyer, 'buy', 7777, 10, 2)

    // 卖方持仓清零后应当被删除
    expect(seller.positions.has(SYM)).toBe(false)

    // 卖方再以新价买入，均价应等于新价 —— 没有任何旧成本残留
    seller.cashCents = 1_000_000_00
    const counterSeller = makeSeller(SYM, 5, 4000)
    submitOrder(counterSeller, 'sell', 4000, 5, 3)
    submitOrder(seller, 'buy', 4000, 5, 4)

    const pos = seller.positions.get(SYM)!
    expect(pos.qty).toBe(5)
    expect(pos.totalCostCents).toBe(4000 * 5)
  })
})
