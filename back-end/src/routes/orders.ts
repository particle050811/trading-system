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
  // 上限确保 priceCents * qty 不超出 Number.MAX_SAFE_INTEGER（约 9e15）。
  // 单价上限 10 亿分（即 1000 万元）、数量上限 10 亿股，乘积最多 1e18 会溢出，
  // 因此两者都钳制在 1e9 以内，给部分成交累加结算留出余量。
  const MAX_PRICE_CENTS = 1_000_000_000
  const MAX_QTY = 1_000_000_000
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
