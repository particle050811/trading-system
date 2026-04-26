import { Router } from 'express'
import { authRequired, type AuthedRequest } from '../middleware/auth.js'
import { findById } from '../store/users.js'
import { getStock } from '../store/stocks.js'
import { listRecentTrades } from '../store/orders.js'

const router = Router()

// GET /api/portfolio/me：返回当前用户的账户快照（资金 + 持仓 + 最新价）。
// 前端定时刷新或 WS portfolio 事件之外的兜底拉取都用它。
router.get('/me', authRequired, (req: AuthedRequest, res) => {
  const user = findById(req.userId!)
  if (!user) return res.status(401).json({ message: '用户不存在' })
  res.json({
    username: user.username,
    cashCents: user.cashCents,
    frozenCashCents: user.frozenCashCents,
    positions: Array.from(user.positions, ([symbol, p]) => ({
      symbol,
      qty: p.qty,
      frozenQty: p.frozenQty,
      totalCostCents: p.totalCostCents,
      lastPriceCents: getStock(symbol)?.lastPriceCents ?? 0,
    })),
  })
})

// GET /api/portfolio/trades：全市场最近成交（公开），用于"成交记录"面板。
router.get('/trades', (_req, res) => {
  res.json({ trades: listRecentTrades() })
})

export default router
