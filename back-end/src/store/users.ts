import { config } from '../config.js'
import { listStocks } from './stocks.js'

export interface Position {
  qty: number
  // 当前持仓的总成本（单位：分）。均价 = totalCostCents / qty，仅在买入时更新。
  totalCostCents: number
  // 被未成交卖单冻结的股数。可用持仓 = qty - frozenQty。
  frozenQty: number
}

export interface User {
  id: string
  username: string
  password: string
  cashCents: number
  // 被未成交买单冻结的资金（按 priceCents * 未成交量 累加）。
  frozenCashCents: number
  positions: Map<string, Position>
}

const users = new Map<string, User>()

// 按用户名查找用户（线性扫描，仅用于登录路径，量级很小）。
export function findByUsername(username: string): User | undefined {
  for (const u of users.values()) if (u.username === username) return u
}

// 按用户 ID 查找用户，O(1)。撮合/路由热路径都走这里。
export function findById(id: string): User | undefined {
  return users.get(id)
}

// 新建用户：分配 UUID、写入初始资金、空持仓。
export function createUser(username: string, password: string): User {
  const id = crypto.randomUUID()
  const user: User = {
    id,
    username,
    password,
    cashCents: config.initialCashCents,
    frozenCashCents: 0,
    positions: new Map(),
  }
  users.set(id, user)
  return user
}

for (const { username, password } of config.seedDevUsers) {
  if (!findByUsername(username)) createUser(username, password)
}

// 给每个开发种子用户预先发放每只股票若干股，方便冷启动直接演示撮合。
// 成本基准取该股票的种子价。
for (const { username } of config.seedDevUsers) {
  const u = findByUsername(username)
  if (!u) continue
  for (const s of listStocks()) {
    if (!u.positions.has(s.symbol)) {
      u.positions.set(s.symbol, {
        qty: 1000,
        frozenQty: 0,
        totalCostCents: s.lastPriceCents * 1000,
      })
    }
  }
}
