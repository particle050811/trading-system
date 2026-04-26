// 行情 store：首屏 HTTP 拉取一次，之后由 WS quote 事件增量更新。
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchStocks } from '@/api/stocks'
import type { Stock } from '@/types'

export const useMarketStore = defineStore('market', () => {
  // 用 Map 维护 symbol -> Stock，行情更新只改对应一项。
  const stocks = ref<Map<string, Stock>>(new Map())

  const list = computed<Stock[]>(() => Array.from(stocks.value.values()))

  function getStock(symbol: string): Stock | undefined {
    return stocks.value.get(symbol)
  }

  // 拉取首屏行情。
  async function load(): Promise<void> {
    const res = await fetchStocks()
    const next = new Map<string, Stock>()
    for (const s of res.stocks) next.set(s.symbol, s)
    stocks.value = next
  }

  // WS quote 事件回调。
  function applyQuote(s: Stock): void {
    // Map 直接 set，stocks.value 触发引用更新需重新赋值才能让 computed 走，
    // 但这里 stocks.value 是 reactive 的 Ref<Map>，对 Map 内部的修改 Vue 默认
    // 不追踪——所以重新构造一个新 Map 来触发响应式。
    const next = new Map(stocks.value)
    next.set(s.symbol, s)
    stocks.value = next
  }

  // setup-style store 不会自动生成 $reset；登出时手动清空。
  function reset(): void {
    stocks.value = new Map()
  }

  return { stocks, list, getStock, load, applyQuote, reset }
})
