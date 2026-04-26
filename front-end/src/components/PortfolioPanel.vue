<script setup lang="ts">
// 持仓面板：资金概况 + 持仓明细。lastPrice 取行情 store 的最新值（WS 心跳同步）。
import { computed } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { useMarketStore } from '@/stores/market'
import { fmtMoneyCents, fmtPriceCents, fmtPct, pctChange } from '@/utils/format'

const portfolio = usePortfolioStore()
const market = useMarketStore()

interface Row {
  symbol: string
  qty: number
  frozenQty: number
  available: number
  avgPriceCents: number
  lastPriceCents: number
  marketValueCents: number
  pnlPct: number
  pnlCents: number
}

const rows = computed<Row[]>(() =>
  portfolio.positions.map((p) => {
    const last = market.getStock(p.symbol)?.lastPriceCents ?? p.lastPriceCents ?? 0
    const avg = p.qty > 0 ? p.totalCostCents / p.qty : 0
    const marketValue = last * p.qty
    const pnlCents = marketValue - p.totalCostCents
    return {
      symbol: p.symbol,
      qty: p.qty,
      frozenQty: p.frozenQty,
      available: p.qty - p.frozenQty,
      avgPriceCents: avg,
      lastPriceCents: last,
      marketValueCents: marketValue,
      pnlCents,
      pnlPct: pctChange(last, avg === 0 ? 0 : Math.round(avg)),
    }
  }),
)

const totalMarketValue = computed(() => rows.value.reduce((s, r) => s + r.marketValueCents, 0))
const totalAsset = computed(
  () => totalMarketValue.value + portfolio.cashCents + portfolio.frozenCashCents,
)
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span>账户与持仓</span>
    </template>
    <el-descriptions :column="2" size="small" border>
      <el-descriptions-item label="可用资金">
        {{ fmtMoneyCents(portfolio.cashCents) }}
      </el-descriptions-item>
      <el-descriptions-item label="冻结资金">
        {{ fmtMoneyCents(portfolio.frozenCashCents) }}
      </el-descriptions-item>
      <el-descriptions-item label="持仓市值">
        {{ fmtMoneyCents(totalMarketValue) }}
      </el-descriptions-item>
      <el-descriptions-item label="总资产">
        {{ fmtMoneyCents(totalAsset) }}
      </el-descriptions-item>
    </el-descriptions>
    <el-table :data="rows" size="small" empty-text="暂无持仓" style="margin-top: 12px">
      <el-table-column prop="symbol" label="代码" width="100" />
      <el-table-column label="持仓 / 可用" align="right" width="120">
        <template #default="{ row }">{{ row.qty }} / {{ row.available }}</template>
      </el-table-column>
      <el-table-column label="均价" align="right" width="100">
        <template #default="{ row }">{{ fmtPriceCents(row.avgPriceCents) }}</template>
      </el-table-column>
      <el-table-column label="现价" align="right" width="100">
        <template #default="{ row }">{{ fmtPriceCents(row.lastPriceCents) }}</template>
      </el-table-column>
      <el-table-column label="市值" align="right" width="120">
        <template #default="{ row }">{{ fmtMoneyCents(row.marketValueCents) }}</template>
      </el-table-column>
      <el-table-column label="浮动盈亏" align="right" width="160">
        <template #default="{ row }">
          <span :class="row.pnlCents > 0 ? 'up-text' : row.pnlCents < 0 ? 'down-text' : ''">
            {{ fmtMoneyCents(row.pnlCents) }} ({{ fmtPct(row.pnlPct) }})
          </span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
:deep(.up-text) {
  color: #f56c6c;
}
:deep(.down-text) {
  color: #67c23a;
}
</style>
