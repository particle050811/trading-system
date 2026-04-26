<script setup lang="ts">
// 我的委托：单一时间倒序列表，包含未成交、部分成交、已成交、已撤销。
// 不再分 tab —— 瞬时成交也能直接看到，避免误以为下单失败。
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useOrdersStore } from '@/stores/orders'
import { cancelOrder } from '@/api/orders'
import { fmtPriceCents, fmtTime, orderStatusLabel } from '@/utils/format'
import type { Order } from '@/types'

const orders = useOrdersStore()
const cancelingId = ref<string | null>(null)

function canCancel(o: Order): boolean {
  return o.status === 'open' || o.status === 'partial'
}

function statusTagType(o: Order): 'info' | 'warning' | 'success' | 'danger' {
  switch (o.status) {
    case 'open':
      return 'info'
    case 'partial':
      return 'warning'
    case 'filled':
      return 'success'
    case 'canceled':
      return 'danger'
  }
}

async function onCancel(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm('确认撤销这笔委托？', '撤单', { type: 'warning' })
  } catch {
    return
  }
  cancelingId.value = id
  try {
    await cancelOrder(id)
    ElMessage.success('已撤销')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '撤单失败')
  } finally {
    cancelingId.value = null
  }
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span>我的委托</span>
    </template>
    <el-table :data="orders.orders" size="small" empty-text="暂无委托" max-height="420">
      <el-table-column label="时间" width="100">
        <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="symbol" label="代码" width="100" />
      <el-table-column label="方向" width="80">
        <template #default="{ row }">
          <el-tag :type="row.side === 'buy' ? 'danger' : 'success'" size="small">
            {{ row.side === 'buy' ? '买入' : '卖出' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="价格" align="right" width="100">
        <template #default="{ row }">{{ fmtPriceCents(row.priceCents) }}</template>
      </el-table-column>
      <el-table-column label="已成交 / 总量" align="right" width="140">
        <template #default="{ row }">{{ row.filledQty }} / {{ row.qty }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row)" size="small" effect="plain">
            {{ orderStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button
            v-if="canCancel(row)"
            size="small"
            text
            type="primary"
            :loading="cancelingId === row.id"
            @click="onCancel(row.id)"
            >撤单</el-button
          >
          <span v-else style="color: var(--el-text-color-placeholder)">—</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
