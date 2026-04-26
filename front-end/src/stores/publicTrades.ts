// 公开成交 store：全市场最近成交，用于"成交记录"面板。
// 后端 WS 不广播全市场 trade（trade 只私推给买卖双方），所以这里靠 HTTP 轮询拉取，
// 间隔 2s。也可以在收到自己 WS trade 时 prepend 一次，进一步提升即时性。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchPublicTrades } from '@/api/portfolio'
import type { Trade } from '@/types'

export const usePublicTradesStore = defineStore('publicTrades', () => {
  const trades = ref<Trade[]>([])
  let timer: ReturnType<typeof setInterval> | null = null

  async function load(): Promise<void> {
    try {
      const res = await fetchPublicTrades()
      trades.value = res.trades
    } catch {
      // 单次拉取失败不破坏轮询节奏，下个 tick 再试；避免未捕获 reject 噪音。
    }
  }

  function start(intervalMs = 2000): void {
    if (timer) return
    void load()
    timer = setInterval(() => void load(), intervalMs)
  }

  function stop(): void {
    if (timer) clearInterval(timer)
    timer = null
  }

  // 收到自己的 WS trade 时也插一条，避免轮询间隙下单后看不到自己刚成交。
  function applyTrade(t: Trade): void {
    if (trades.value.some((x) => x.id === t.id)) return
    const next = [t, ...trades.value]
    if (next.length > 50) next.length = 50
    trades.value = next
  }

  return { trades, load, start, stop, applyTrade }
})
