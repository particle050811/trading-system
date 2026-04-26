<script setup lang="ts">
// 行情面板：列表展示所有股票，点击行触发"selected"事件供下单面板预填。
import { computed } from 'vue'
import { useMarketStore } from '@/stores/market'
import { fmtPriceCents, pctChange, fmtPct } from '@/utils/format'

const market = useMarketStore()

const emit = defineEmits<{ (e: 'select', symbol: string): void }>()

const rows = computed(() =>
  market.list.map((s) => ({
    ...s,
    change: pctChange(s.lastPriceCents, s.prevCloseCents),
  })),
)

function rowClass({ row }: { row: { change: number } }) {
  if (row.change > 0) return 'up'
  if (row.change < 0) return 'down'
  return ''
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span>行情看板</span>
    </template>
    <el-table
      :data="rows"
      :row-class-name="rowClass"
      highlight-current-row
      size="small"
      @row-click="(row: { symbol: string }) => emit('select', row.symbol)"
    >
      <el-table-column prop="symbol" label="代码" width="100" />
      <el-table-column prop="name" label="名称" />
      <el-table-column label="最新价" align="right" width="100">
        <template #default="{ row }">{{ fmtPriceCents(row.lastPriceCents) }}</template>
      </el-table-column>
      <el-table-column label="昨收" align="right" width="100">
        <template #default="{ row }">{{ fmtPriceCents(row.prevCloseCents) }}</template>
      </el-table-column>
      <el-table-column label="涨跌幅" align="right" width="120">
        <template #default="{ row }">
          <span :class="row.change > 0 ? 'up-text' : row.change < 0 ? 'down-text' : ''">
            {{ fmtPct(row.change) }}
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
:deep(.el-table .up) {
  background-color: #fff5f5;
}
:deep(.el-table .down) {
  background-color: #f5fbf5;
}
</style>
