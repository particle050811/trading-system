// 账户 store：资金 + 持仓。HTTP 拉取一次，之后由 WS portfolio 事件覆盖。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchMyPortfolio } from '@/api/portfolio'
import type { PortfolioSnapshot, Position } from '@/types'

export const usePortfolioStore = defineStore('portfolio', () => {
  const cashCents = ref(0)
  const frozenCashCents = ref(0)
  const positions = ref<Position[]>([])

  async function load(): Promise<void> {
    const res = await fetchMyPortfolio()
    cashCents.value = res.cashCents
    frozenCashCents.value = res.frozenCashCents
    positions.value = res.positions
  }

  // WS portfolio 事件覆盖整个快照。lastPriceCents 由 WS 不带，前端展示时
  // 现取行情 store 的最新价兜底。
  function applySnapshot(snap: Omit<PortfolioSnapshot, 'username'>): void {
    cashCents.value = snap.cashCents
    frozenCashCents.value = snap.frozenCashCents
    positions.value = snap.positions
  }

  function reset(): void {
    cashCents.value = 0
    frozenCashCents.value = 0
    positions.value = []
  }

  return { cashCents, frozenCashCents, positions, load, applySnapshot, reset }
})
