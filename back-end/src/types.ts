export type Side = 'buy' | 'sell'

export type OrderStatus = 'open' | 'partial' | 'filled' | 'canceled'

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

export interface Stock {
  symbol: string
  name: string
  lastPriceCents: number
  prevCloseCents: number
}
