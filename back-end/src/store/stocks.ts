import type { Stock } from '../types.js'

const seed: Array<Pick<Stock, 'symbol' | 'name' | 'lastPriceCents'>> = [
  { symbol: 'STK001', name: '虚构科技', lastPriceCents: 5000 },
  { symbol: 'STK002', name: '虚构能源', lastPriceCents: 1280 },
  { symbol: 'STK003', name: '虚构金融', lastPriceCents: 3650 },
]

const stocks = new Map<string, Stock>()
for (const s of seed) {
  stocks.set(s.symbol, { ...s, prevCloseCents: s.lastPriceCents })
}

// 列出全部股票（行情面板、行情心跳器都依赖它）。
export function listStocks(): Stock[] {
  return Array.from(stocks.values())
}

// 按代码取单只股票，不存在返回 undefined（下单接口校验 symbol 用）。
export function getStock(symbol: string): Stock | undefined {
  return stocks.get(symbol)
}

// 更新最新价：成交时由撮合引擎调用，行情心跳器随机游走时也调用。
export function setLastPrice(symbol: string, priceCents: number): void {
  const s = stocks.get(symbol)
  if (s) s.lastPriceCents = priceCents
}
