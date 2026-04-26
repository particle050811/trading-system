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
//
// 设计原则：**后端只存精确整数**。Position 字段全是整数：totalCostCents
// (T), qty (Q), frozenQty。**不存任何均价、任何不精确值**——"持仓均价"
// 是前端拿 T、Q 自己算 T/Q 时按显示精度（保留几位小数）做四舍五入，
// 与后端存储无关。
//
// 这里的 `round(T * q / Q)` 不是"为了消化误差"，而是因为 T*q/Q 数学上
// 不一定整除，而我们只能往 totalCostCents 写整数——所以必须把它整数化
// 后再扣，以维持"存的全是整数"这个不变量。整数化之后 T_n 仍然是精确
// 整数，没有"半分残值被悄悄存进去"这回事。
//
// 设 T_n、Q_n 为第 n 次卖出后的状态，q_n 为该次卖出量：
//   writeOff_n = round(T_{n-1} * q_n / Q_{n-1})
//   T_n        = T_{n-1} - writeOff_n          ∈ ℤ
//   Q_n        = Q_{n-1} - q_n                 ∈ ℤ
//
// 不变量 A（清仓边界自洽）：清仓那一笔 q_k = Q_{k-1}，于是
//     writeOff_k = round(T_{k-1} * Q_{k-1} / Q_{k-1}) = round(T_{k-1})
//                = T_{k-1}                                （T 本身就是整数）
//   ⇒ T_k = 0 精确成立。Q 归零的同一时刻 T 必然精确等于 0，跨周期不会
//   把任何"零碎成本"带进下一次买入。这是"用当前 T、当前 Q 作分母"的
//   副产品——每一步都基于最新状态自我修正，而不是反复叠加初始值的误差。
//
// 不变量 B（无偏舍入）：用 Math.round（四舍五入）而非 floor/ceil。在期望
//   意义上无偏；单向舍入会让 totalCostCents 被系统性偏离真实流入金额，
//   长期对账时会暴露。这是金融系统对成本摊销的标配选择。
export function deliverShares(user: User, symbol: string, qty: number): void {
  const pos = user.positions.get(symbol)
  if (!pos) return
  if (pos.qty > 0) {
    const writeOff = Math.round((pos.totalCostCents * qty) / pos.qty)
    // Math.max(0, …)：纯防御性钳制。当前公式下 q ≤ Q ⇒ writeOff ≤ T，
    // 不可能出负；但留这道保险，将来若有人改成"基于初始 T、初始 Q 摊销"
    // 之类的变体，bug 出来时不至于悄悄落进账本。
    pos.totalCostCents = Math.max(0, pos.totalCostCents - writeOff)
  }
  pos.qty -= qty
  pos.frozenQty -= qty
  if (pos.qty <= 0) {
    // 由不变量 A，pos.totalCostCents 此刻已经精确为 0；这一行赋值在当前
    // 公式下是冗余的，留它把"清仓即整体清零"写成可执行代码，对未来若有
    // 人改摊销公式形成兜底。delete 之后字段就没人读了，所以两行都是审计
    // 语义而非性能/正确性需要。
    pos.totalCostCents = 0
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
