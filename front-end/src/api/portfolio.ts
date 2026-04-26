import http from './http'
import type { PortfolioSnapshot, Trade } from '@/types'

// GET /api/portfolio/me：账户快照（资金 + 持仓 + 持仓最新价）。
export function fetchMyPortfolio() {
  return http.get<any, PortfolioSnapshot>('/portfolio/me')
}

// GET /api/portfolio/trades：全市场最近成交（公开）。
export function fetchPublicTrades() {
  return http.get<any, { trades: Trade[] }>('/portfolio/trades')
}
