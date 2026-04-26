import type { User, Position } from './users.js'

// 下买单时冻结资金：把 cashCents 中的指定金额挪到 frozenCashCents。
// 返回 true 表示冻结成功；可用资金不足时返回 false 让上层拒单。
export function reserveCash(user: User, amountCents: number): boolean {
  if (user.cashCents < amountCents) return false
  user.cashCents -= amountCents
  user.frozenCashCents += amountCents
  return true
}

// 释放冻结资金但不扣款（撤单、或者按更优价格成交时退回限价差额）。
// 调用方需自行保证 amountCents <= 当前 frozenCashCents。
export function releaseCash(user: User, amountCents: number): void {
  user.frozenCashCents -= amountCents
  user.cashCents += amountCents
}

// 扣减已冻结的资金（买单成交时实际扣款）：从 frozen 减掉，不再回到可用资金。
export function spendFrozenCash(user: User, amountCents: number): void {
  user.frozenCashCents -= amountCents
}

// 下卖单时冻结股票：仅增加 frozenQty，qty 不变（成交前持仓还在）。
// 可用持仓 = qty - frozenQty 不足时返回 false。
export function reserveShares(user: User, symbol: string, qty: number): boolean {
  const pos = user.positions.get(symbol)
  if (!pos || pos.qty - pos.frozenQty < qty) return false
  pos.frozenQty += qty
  return true
}

// 释放冻结的股票（撤销卖单时撤回冻结）。
export function releaseShares(user: User, symbol: string, qty: number): void {
  const pos = user.positions.get(symbol)
  if (!pos) return
  pos.frozenQty -= qty
}

// 卖单成交结算：股票真正离开持仓，并按比例摊销成本。
export function deliverShares(user: User, symbol: string, qty: number): void {
  const pos = user.positions.get(symbol)
  if (!pos) return
  // 成本摊销：按 (qty / pos.qty) 的比例一次性整数舍入扣减成本；
  // 持仓清零时强制把 totalCostCents 置 0，避免舍入残值跨越下次买入。
  if (pos.qty > 0) {
    const writeOff = Math.round((pos.totalCostCents * qty) / pos.qty)
    pos.totalCostCents = Math.max(0, pos.totalCostCents - writeOff)
  }
  pos.qty -= qty
  pos.frozenQty -= qty
  if (pos.qty <= 0) {
    user.positions.delete(symbol)
  }
}

// 买单成交结算：把成交股数加入持仓，并按实际成交金额累加成本。
export function receiveShares(user: User, symbol: string, qty: number, costCents: number): void {
  const pos: Position = user.positions.get(symbol) ?? { qty: 0, frozenQty: 0, totalCostCents: 0 }
  pos.qty += qty
  pos.totalCostCents += costCents
  user.positions.set(symbol, pos)
}
