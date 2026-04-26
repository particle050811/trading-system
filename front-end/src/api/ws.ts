// 简单 WS 客户端封装：根据当前 token 建连，断线指数退避重连，
// 通过 mitt 风格的事件分发把后端推来的消息派发给各 store。
//
// 后端协议（见 back-end/src/ws/hub.ts）：
//   { type: 'hello',    userId }
//   { type: 'snapshot', orders, trades, cashCents, frozenCashCents, positions }
//   { type: 'quote',    stock }
//   { type: 'order',    order }
//   { type: 'trade',    trade }
//   { type: 'portfolio', cashCents, frozenCashCents, positions }

import type { Order, Stock, Trade } from '@/types'

type Position = { symbol: string; qty: number; frozenQty: number; totalCostCents: number }

export type WsMessage =
  | { type: 'hello'; userId: string | null }
  | {
      type: 'snapshot'
      orders: Order[]
      trades: Trade[]
      cashCents: number
      frozenCashCents: number
      positions: Position[]
    }
  | { type: 'quote'; stock: Stock }
  | { type: 'order'; order: Order }
  | { type: 'trade'; trade: Trade }
  | {
      type: 'portfolio'
      cashCents: number
      frozenCashCents: number
      positions: Position[]
    }

type Handler = (msg: WsMessage) => void

const handlers = new Set<Handler>()
let socket: WebSocket | null = null
let retry = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let manualClose = false

// 注册消息回调，返回解绑函数。
export function onMessage(fn: Handler): () => void {
  handlers.add(fn)
  return () => handlers.delete(fn)
}

function dispatch(raw: string): void {
  let msg: WsMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  for (const fn of handlers) fn(msg)
}

// 建立连接：通过 query 把 token 带上，后端用 jwt 鉴权。
// 没有 token 时仍然连上（匿名也能收行情广播）。
export function connectWs(token: string): void {
  manualClose = false
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close()
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`
  const ws = new WebSocket(url)
  socket = ws

  ws.addEventListener('open', () => {
    retry = 0
  })
  ws.addEventListener('message', (ev) => dispatch(typeof ev.data === 'string' ? ev.data : ''))
  ws.addEventListener('close', () => {
    if (manualClose) return
    // 指数退避（上限 10s）：1s, 2s, 4s, 8s, 10s, 10s...
    const delay = Math.min(10000, 1000 * 2 ** retry)
    retry++
    reconnectTimer = setTimeout(() => connectWs(token), delay)
  })
  ws.addEventListener('error', () => {
    // 错误事件后通常紧跟 close，统一在 close 里处理重连。
  })
}

// 主动断开（登出时调用）：阻止自动重连。
export function disconnectWs(): void {
  manualClose = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.close()
    socket = null
  }
}
