import { Router } from 'express'
import { listStocks } from '../store/stocks.js'

const router = Router()

// GET /api/stocks：返回行情列表（代码、名称、最新价、昨收价）。
// 前端首屏加载时拉取，后续行情走 WS quote 事件增量更新。
router.get('/', (_req, res) => {
  res.json({
    stocks: listStocks().map((s) => ({
      symbol: s.symbol,
      name: s.name,
      lastPriceCents: s.lastPriceCents,
      prevCloseCents: s.prevCloseCents,
    })),
  })
})

export default router
