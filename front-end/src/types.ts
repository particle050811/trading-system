// 与后端 back-end/src/types.ts 对齐的最小类型集合。
// 金额一律以"分"为单位，前端展示时再 / 100 转元。

export type Side = 'buy' | 'sell'
export type OrderStatus = 'open' | 'partial' | 'filled' | 'canceled'

export interface Stock {
  symbol: string
  name: string
  lastPriceCents: number
  prevCloseCents: number
}

export interface Order {
  id: string
  userId: string
  symbol: string
  side: Side
  priceCents: number
  qty: number
  filledQty: number
  status: OrderStatus
  createdAt: number
}

export interface Trade {
  id: string
  symbol: string
  priceCents: number
  qty: number
  buyOrderId: string
  sellOrderId: string
  buyUserId: string
  sellUserId: string
  ts: number
}

export interface Position {
  symbol: string
  qty: number
  frozenQty: number
  totalCostCents: number
  // /api/portfolio/me 返回，WS portfolio 不返回；前端取最新行情兜底。
  lastPriceCents?: number
}

export interface PortfolioSnapshot {
  username?: string
  cashCents: number
  frozenCashCents: number
  positions: Position[]
}
