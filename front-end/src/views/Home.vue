<script setup lang="ts">
// 主页：四个面板拼装 + WS 连接生命周期。
// 所有 store 在登录后首次进入 Home 时统一加载，并订阅 WS 把推送分发到对应 store。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useMarketStore } from '@/stores/market'
import { usePortfolioStore } from '@/stores/portfolio'
import { useOrdersStore } from '@/stores/orders'
import { usePublicTradesStore } from '@/stores/publicTrades'
import { connectWs, disconnectWs, onMessage } from '@/api/ws'
import MarketPanel from '@/components/MarketPanel.vue'
import OrderForm from '@/components/OrderForm.vue'
import OrdersPanel from '@/components/OrdersPanel.vue'
import PortfolioPanel from '@/components/PortfolioPanel.vue'
import TradesPanel from '@/components/TradesPanel.vue'

const user = useUserStore()
const router = useRouter()
const market = useMarketStore()
const portfolio = usePortfolioStore()
const orders = useOrdersStore()
const publicTrades = usePublicTradesStore()

// 当前选中的股票代码（行情面板点击 / 下单面板下拉切换）。
const selectedSymbol = ref<string>('')

let unbind: (() => void) | null = null

onMounted(async () => {
  // 记下当前 token；如果在并发 load 期间被 logout()，token 会被清空，
  // 此时丢弃这次结果，避免把上个用户的数据写回 store。
  const tokenAtLoad = user.token
  try {
    await Promise.all([market.load(), portfolio.load(), orders.load()])
    if (user.token !== tokenAtLoad) return
    if (!selectedSymbol.value && market.list.length > 0) {
      selectedSymbol.value = market.list[0]!.symbol
    }
  } catch {
    // 拉取失败不阻塞 WS：401 已经在 http 拦截器里处理过了。
  }
  if (user.token !== tokenAtLoad) return
  publicTrades.start(2000)
  connectWs(user.token)
  // 注册 WS 消息分发：按 type 路由到对应 store。
  unbind = onMessage((msg) => {
    switch (msg.type) {
      case 'snapshot':
        // 重连后服务端下发的完整快照：用它整体覆盖本地委托/成交/账户，
        // 抹平连接断开期间错过的增量。
        orders.applySnapshot({ orders: msg.orders, trades: msg.trades })
        portfolio.applySnapshot({
          cashCents: msg.cashCents,
          frozenCashCents: msg.frozenCashCents,
          positions: msg.positions,
        })
        break
      case 'quote':
        market.applyQuote(msg.stock)
        break
      case 'order':
        orders.applyOrder(msg.order)
        break
      case 'trade':
        orders.applyTrade(msg.trade)
        publicTrades.applyTrade(msg.trade)
        break
      case 'portfolio':
        portfolio.applySnapshot({
          cashCents: msg.cashCents,
          frozenCashCents: msg.frozenCashCents,
          positions: msg.positions,
        })
        break
    }
  })
})

onBeforeUnmount(() => {
  publicTrades.stop()
  if (unbind) unbind()
  unbind = null
  disconnectWs()
})

function logout(): void {
  publicTrades.stop()
  disconnectWs()
  market.reset()
  portfolio.reset()
  orders.reset()
  user.logout()
  router.push('/login')
}
</script>

<template>
  <el-container class="home">
    <el-header class="header">
      <span class="title">股票模拟交易系统</span>
      <div class="right">
        <span>{{ user.username }}</span>
        <el-button size="small" @click="logout">退出</el-button>
      </div>
    </el-header>
    <el-main class="main">
      <div class="grid">
        <div class="col-left">
          <MarketPanel @select="(s) => (selectedSymbol = s)" />
          <OrdersPanel />
          <PortfolioPanel />
        </div>
        <div class="col-right">
          <OrderForm v-model:symbol="selectedSymbol" />
          <TradesPanel />
        </div>
      </div>
    </el-main>
  </el-container>
</template>

<style scoped>
.home {
  height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}
.title {
  font-size: 18px;
  font-weight: 600;
}
.right {
  display: flex;
  gap: 12px;
  align-items: center;
}
.main {
  background: #f5f7fa;
}
.grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  align-items: start;
}
.col-left,
.col-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
@media (max-width: 1024px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
