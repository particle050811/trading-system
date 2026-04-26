// 委托 / 成交 store：列出当前用户的委托和最近成交，并在 WS 推送上做增量合并。
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchMyOrders, fetchMyTrades } from '@/api/orders'
import type { Order, Trade } from '@/types'

export const useOrdersStore = defineStore('orders', () => {
  // 用 Map<id, Order> 便于 WS 增量按 id 覆盖。
  const orderMap = ref<Map<string, Order>>(new Map())
  // trades 维持时间倒序（最新在前），与后端 listUserTrades 一致。
  const trades = ref<Trade[]>([])

  // 单一委托表（按 createdAt 倒序）：未成交、部分成交、已成交、已撤销
  // 都在同一张表里，避免瞬时成交看不到。
  const orders = computed<Order[]>(() => {
    const arr = Array.from(orderMap.value.values())
    arr.sort((a, b) => b.createdAt - a.createdAt)
    return arr
  })

  async function load(): Promise<void> {
    const [a, b] = await Promise.all([fetchMyOrders(), fetchMyTrades()])
    const m = new Map<string, Order>()
    for (const o of a.orders) m.set(o.id, o)
    orderMap.value = m
    trades.value = b.trades
  }

  // WS order 事件：覆盖（新建或状态变更都走同一个 id）。
  function applyOrder(o: Order): void {
    const m = new Map(orderMap.value)
    m.set(o.id, o)
    orderMap.value = m
  }

  // WS trade 事件：插入到首位，最多保留 200 条避免无限增长。
  function applyTrade(t: Trade): void {
    // 同一个 trade 可能买卖双方各推一次——用 id 去重。
    if (trades.value.some((x) => x.id === t.id)) return
    const next = [t, ...trades.value]
    if (next.length > 200) next.length = 200
    trades.value = next
  }

  function reset(): void {
    orderMap.value = new Map()
    trades.value = []
  }

  return {
    orders,
    trades,
    load,
    applyOrder,
    applyTrade,
    reset,
  }
})
