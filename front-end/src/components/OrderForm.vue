<script setup lang="ts">
// 下单面板：选股 + 限价 + 数量，提交买/卖。
// 限价默认填当前最新价（点击行情行后会从父组件传入并自动同步）。
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useMarketStore } from '@/stores/market'
import { useOrdersStore } from '@/stores/orders'
import { usePortfolioStore } from '@/stores/portfolio'
import { placeOrder } from '@/api/orders'
import { fmtMoneyCents, fmtPriceCents } from '@/utils/format'
import type { Side } from '@/types'

const props = defineProps<{ symbol: string }>()
const emit = defineEmits<{ (e: 'update:symbol', s: string): void }>()

const market = useMarketStore()
const ordersStore = useOrdersStore()
const portfolioStore = usePortfolioStore()

const side = ref<Side>('buy')
// 价格用元（带两位小数），提交前 *100 转分；数量为整数股。
const priceYuan = ref<number | null>(null)
const qty = ref<number | null>(null)
const submitting = ref(false)

const currentStock = computed(() => market.getStock(props.symbol))

// 选中股票变化时，把价格预填为最新价（避免每次心跳都被覆盖：仅在 symbol 切换时填）。
watch(
  () => props.symbol,
  (sym) => {
    const s = market.getStock(sym)
    if (s) priceYuan.value = s.lastPriceCents / 100
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (!props.symbol) {
    ElMessage.warning('请先选择股票')
    return
  }
  if (priceYuan.value == null || priceYuan.value <= 0) {
    ElMessage.warning('请输入正确的限价')
    return
  }
  if (qty.value == null || !Number.isInteger(qty.value) || qty.value <= 0) {
    ElMessage.warning('请输入正整数数量')
    return
  }
  // 价格 * 100 之后必须是整数分；用 round 避免浮点误差（例如 12.34 * 100 = 1233.9999999）。
  const priceCents = Math.round(priceYuan.value * 100)
  submitting.value = true
  try {
    const res = await placeOrder({
      symbol: props.symbol,
      side: side.value,
      priceCents,
      qty: qty.value,
    })
    // WS order/portfolio 推送是主路径；这里同步把返回的订单写入 store，
    // 并兜底拉一次账户快照，避免 WS 抖动时表格看不到新委托。
    ordersStore.applyOrder(res.order)
    void portfolioStore.load()
    ElMessage.success(side.value === 'buy' ? '买入委托已提交' : '卖出委托已提交')
    qty.value = null
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? '下单失败')
  } finally {
    submitting.value = false
  }
}

const totalLabel = computed(() => {
  if (priceYuan.value == null || qty.value == null) return '—'
  return fmtMoneyCents(Math.round(priceYuan.value * 100) * qty.value)
})
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span>交易面板</span>
    </template>
    <el-form label-width="64px" size="default">
      <el-form-item label="股票">
        <el-select
          :model-value="symbol"
          placeholder="请选择股票"
          style="width: 100%"
          @update:model-value="(v: string) => emit('update:symbol', v)"
        >
          <el-option
            v-for="s in market.list"
            :key="s.symbol"
            :label="`${s.symbol} ${s.name}`"
            :value="s.symbol"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="最新价">
        <span v-if="currentStock">{{ fmtPriceCents(currentStock.lastPriceCents) }}</span>
        <span v-else>—</span>
      </el-form-item>
      <el-form-item label="方向">
        <el-radio-group v-model="side">
          <el-radio-button value="buy">买入</el-radio-button>
          <el-radio-button value="sell">卖出</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="限价">
        <el-input-number
          v-model="priceYuan"
          :min="0.01"
          :precision="2"
          :step="0.01"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="数量">
        <el-input-number v-model="qty" :min="1" :step="100" :precision="0" style="width: 100%" />
      </el-form-item>
      <el-form-item label="金额">
        <span>{{ totalLabel }}</span>
      </el-form-item>
      <el-form-item>
        <el-button
          :type="side === 'buy' ? 'danger' : 'success'"
          :loading="submitting"
          style="width: 100%"
          @click="submit"
        >
          {{ side === 'buy' ? '买入' : '卖出' }}
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>
