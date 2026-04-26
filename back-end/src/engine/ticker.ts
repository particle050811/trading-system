import { listStocks, setLastPrice } from '../store/stocks.js'
import type { Stock } from '../types.js'

type Listener = (stock: Stock) => void

const listeners = new Set<Listener>()

// 注册行情心跳监听器（WS hub 用它把 quote 广播给所有连接）。
// 返回的函数用于解除订阅。
export function onTick(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// 随机游走：每次心跳把最新价上下浮动至多 ±1%，并保证最低 1 分。
// 真实成交时撮合引擎会以成交价覆盖 lastPrice，盖过随机走势。
function step(): void {
  for (const s of listStocks()) {
    const drift = (Math.random() - 0.5) * 0.02
    const next = Math.max(1, Math.round(s.lastPriceCents * (1 + drift)))
    if (next !== s.lastPriceCents) {
      setLastPrice(s.symbol, next)
    }
    for (const fn of listeners) fn(s)
  }
}

// 启动定时器驱动行情心跳；返回函数用于停止心跳（测试/优雅关闭场景）。
export function startTicker(intervalMs = 1000): () => void {
  const id = setInterval(step, intervalMs)
  return () => clearInterval(id)
}
