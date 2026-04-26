import { Router } from 'express'
import { nanoid } from 'nanoid'
import { authRequired, type AuthedRequest } from '../middleware/auth.js'
import { findById } from '../store/users.js'
import { getStock } from '../store/stocks.js'
import {
  getOrder,
  indexOrder,
  listUserOrders,
  listUserTrades,
} from '../store/orders.js'
import { reserveCash, reserveShares } from '../store/reservation.js'
import { cancelOrder, matchOrder } from '../engine/matcher.js'
import { pushOrder, pushPortfolio, pushTrade } from '../ws/hub.js'
import type { Order } from '../types.js'

const router = Router()

router.use(authRequired)

// GET /api/orders：列出当前用户的所有委托（含历史，含已撤/已成交）。
router.get('/', (req: AuthedRequest, res) => {
  res.json({ orders: listUserOrders(req.userId!) })
})

// GET /api/orders/trades：列出当前用户最近的成交记录（"我的成交"）。
router.get('/trades', (req: AuthedRequest, res) => {
  res.json({ trades: listUserTrades(req.userId!) })
})

// POST /api/orders：下单主入口。
// 流程：参数校验 → 冻结资金/股票 → 入索引 → 撮合 → WS 推送变更。
router.post('/', (req: AuthedRequest, res) => {
  const userId = req.userId!
  const user = findById(userId)
  if (!user) return res.status(401).json({ message: '用户不存在' })

  const { symbol, side, priceCents, qty } = req.body ?? {}
  if (typeof symbol !== 'string' || !getStock(symbol)) {
    return res.status(400).json({ message: '股票代码无效' })
  }
  if (side !== 'buy' && side !== 'sell') {
    return res.status(400).json({ message: 'side 必须为 buy 或 sell' })
  }
  // 抗滥用硬护栏（不是精度论证）：
  //   - 单价上限 100 万分 = 1 万元/股，远高于任何真实股票价格；
  //   - 数量上限 100 万股/单，远高于任何零售单笔下单量；
  //   - 乘积上限 10^12 cents，距 Number.MAX_SAFE_INTEGER (≈9e15) 仍有
  //     3+ 个数量级余量，多笔部分成交累加也不会触及精度边界。
  // 这条校验的目的是拒绝畸形/恶意输入（POST 一个 priceCents: 1e15
  // 想撑爆服务），让上层异常路径返回 400 而不是悄悄落库或溢出。
  const MAX_PRICE_CENTS = 1_000_000
  const MAX_QTY = 1_000_000
  if (!Number.isInteger(priceCents) || priceCents <= 0 || priceCents > MAX_PRICE_CENTS) {
    return res.status(400).json({ message: 'priceCents 必须为正整数且不超过上限' })
  }
  if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
    return res.status(400).json({ message: 'qty 必须为正整数且不超过上限' })
  }

  if (side === 'buy') {
    if (!reserveCash(user, priceCents * qty)) {
      return res.status(400).json({ message: '可用资金不足' })
    }
  } else {
    if (!reserveShares(user, symbol, qty)) {
      return res.status(400).json({ message: '可用持仓不足' })
    }
  }

  const order: Order = {
    id: nanoid(),
    userId,
    symbol,
    side,
    priceCents,
    qty,
    filledQty: 0,
    status: 'open',
    createdAt: Date.now(),
  }
  indexOrder(order)

  const result = matchOrder(order)
  for (const o of result.affectedOrders) pushOrder(o.userId, o)
  for (const t of result.trades) {
    pushTrade(t.buyUserId, t)
    if (t.sellUserId !== t.buyUserId) pushTrade(t.sellUserId, t)
  }
  for (const uid of result.affectedUserIds) pushPortfolio(uid)

  res.json({ order })
})

// DELETE /api/orders/:id：撤销自己的委托，并通过 WS 推送状态/账户变化。
router.delete('/:id', (req: AuthedRequest, res) => {
  const id = req.params.id
  const order = typeof id === 'string' ? getOrder(id) : undefined
  if (!order || order.userId !== req.userId) {
    return res.status(404).json({ message: '委托不存在' })
  }
  const ok = cancelOrder(order)
  if (!ok) return res.status(409).json({ message: '该委托已无法撤销' })
  pushOrder(order.userId, order)
  pushPortfolio(order.userId)
  res.json({ order })
})

export default router
