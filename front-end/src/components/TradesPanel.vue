<script setup lang="ts">
// 全市场最近成交，公开数据。来自 publicTrades store（HTTP 轮询 + 自身 WS trade prepend）。
import { usePublicTradesStore } from '@/stores/publicTrades'
import { fmtPriceCents, fmtTime } from '@/utils/format'

const publicTrades = usePublicTradesStore()
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span>成交记录</span>
    </template>
    <el-table :data="publicTrades.trades" size="small" max-height="320" empty-text="暂无成交">
      <el-table-column label="时间" width="100">
        <template #default="{ row }">{{ fmtTime(row.ts) }}</template>
      </el-table-column>
      <el-table-column prop="symbol" label="代码" width="100" />
      <el-table-column label="价格" align="right" width="100">
        <template #default="{ row }">{{ fmtPriceCents(row.priceCents) }}</template>
      </el-table-column>
      <el-table-column label="数量" align="right" width="100">
        <template #default="{ row }">{{ row.qty }}</template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
