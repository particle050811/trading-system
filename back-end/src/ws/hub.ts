import type http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { findById } from '../store/users.js'
import type { Order, Stock, Trade } from '../types.js'
import { onTick } from '../engine/ticker.js'
import { listUserOrders, listUserTrades } from '../store/orders.js'

interface Client {
  ws: WebSocket
  userId: string | null
}

// 全部连接（含匿名）：行情广播遍历这一份。
const clients = new Set<Client>()
// 已登录连接的二级索引：userId -> 该用户的所有连接（支持多端登录）。
// 私有推送（pushOrder / pushTrade / pushPortfolio）走这里，O(该用户连接数)。
const clientsByUser = new Map<string, Set<Client>>()

function addClient(client: Client): void {
  clients.add(client)
  if (client.userId) {
    let set = clientsByUser.get(client.userId)
    if (!set) {
      set = new Set()
      clientsByUser.set(client.userId, set)
    }
    set.add(client)
  }
}

function removeClient(client: Client): void {
  clients.delete(client)
  if (!client.userId) return
  const set = clientsByUser.get(client.userId)
  if (!set) return
  set.delete(client)
  if (set.size === 0) clientsByUser.delete(client.userId)
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

// 把 WebSocket 服务挂到现有 HTTP server 的 /ws 路径上。
// 连接时用 query 中的 token 鉴权：合法即绑定 userId（可收私有推送），
// 非法或缺失则视为匿名连接（仍可收行情广播）。同时订阅行情心跳，
// 把 quote 事件广播给所有连接。
export function attachWs(server: http.Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const token = url.searchParams.get('token')
    let userId: string | null = null
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as { sub: string }
        if (findById(payload.sub)) userId = payload.sub
      } catch {
        // token 非法：保持连接打开，按匿名处理（只收行情）。
      }
    }
    const client: Client = { ws, userId }
    addClient(client)
    send(ws, { type: 'hello', userId })
    // 重连后同步最新状态：把当前用户的委托/成交/账户作为一次快照下发，
    // 客户端用它整体覆盖本地 store，弥补连接断开期间错过的增量推送。
    if (userId) sendSnapshot(ws, userId)
    ws.on('close', () => removeClient(client))
  })

  // 把行情心跳广播给所有连接（含匿名）。
  onTick((stock) => broadcast({ type: 'quote', stock: serializeStock(stock) }))
}

// 广播给所有连接（行情/全市场公共消息）。
function broadcast(payload: unknown): void {
  for (const c of clients) send(c.ws, payload)
}

// 仅推送给特定用户的所有连接（撮合后订单/成交/账户变更走这里）。
// 通过 clientsByUser 二级索引直达，复杂度 O(该用户连接数)。
function sendToUser(userId: string, payload: unknown): void {
  const set = clientsByUser.get(userId)
  if (!set) return
  for (const c of set) send(c.ws, payload)
}

function serializeStock(s: Stock) {
  return {
    symbol: s.symbol,
    name: s.name,
    lastPriceCents: s.lastPriceCents,
    prevCloseCents: s.prevCloseCents,
  }
}

// 给指定用户推送订单状态变化（新建、部分/完全成交、撤销等）。
export function pushOrder(userId: string, order: Order): void {
  sendToUser(userId, { type: 'order', order })
}

// 给指定用户推送一笔成交（买卖双方各推一次）。
export function pushTrade(userId: string, trade: Trade): void {
  sendToUser(userId, { type: 'trade', trade })
}

// 连接建立后向单一连接发送一次"完整快照"，用于断线重连后的状态对齐。
// 包含：委托全列表、用户最近成交、账户资金 + 持仓。
function sendSnapshot(ws: WebSocket, userId: string): void {
  const u = findById(userId)
  if (!u) return
  send(ws, {
    type: 'snapshot',
    orders: listUserOrders(userId),
    trades: listUserTrades(userId),
    cashCents: u.cashCents,
    frozenCashCents: u.frozenCashCents,
    positions: Array.from(u.positions, ([symbol, p]) => ({
      symbol,
      qty: p.qty,
      frozenQty: p.frozenQty,
      totalCostCents: p.totalCostCents,
    })),
  })
}

// 给指定用户推送最新账户快照（资金 + 持仓），撮合/撤单结算后调用。
export function pushPortfolio(userId: string): void {
  const u = findById(userId)
  if (!u) return
  sendToUser(userId, {
    type: 'portfolio',
    cashCents: u.cashCents,
    frozenCashCents: u.frozenCashCents,
    positions: Array.from(u.positions, ([symbol, p]) => ({
      symbol,
      qty: p.qty,
      frozenQty: p.frozenQty,
      totalCostCents: p.totalCostCents,
    })),
  })
}
