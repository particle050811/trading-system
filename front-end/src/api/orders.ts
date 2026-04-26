import http from './http'
import type { Order, Side, Trade } from '@/types'

// GET /api/orders：当前用户全部委托（含历史）。
export function fetchMyOrders() {
  return http.get<any, { orders: Order[] }>('/orders')
}

// GET /api/orders/trades：当前用户最近成交。
export function fetchMyTrades() {
  return http.get<any, { trades: Trade[] }>('/orders/trades')
}

// POST /api/orders：下单。
export function placeOrder(payload: {
  symbol: string
  side: Side
  priceCents: number
  qty: number
}) {
  return http.post<any, { order: Order }>('/orders', payload)
}

// DELETE /api/orders/:id：撤单。
export function cancelOrder(id: string) {
  return http.delete<any, { order: Order }>(`/orders/${id}`)
}
