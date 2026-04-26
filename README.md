# 股票模拟交易系统

Vue 3 + TypeScript 前端 / Node.js + Express + ws 后端 / 内存撮合引擎 / WebSocket 实时推送。

仓库地址：<https://github.com/particle050811/trading-system>

关键架构决策与 AI 协作记录见 [PROMPTS.md](./PROMPTS.md)。

## 关键架构决策

1. **挂单簿用跳表 + 同价 FIFO 队列**：`Map<symbol, ProperSkipList<priceCents, Order[]>>`。跨价档跳表 O(log n) 排序，同价档 FIFO 数组保留时间优先；撮合走 `findEntriesFromMin/Max` 双向迭代器从最优档往外扫，撤单 `find(price)` 命中档位再 `splice`。直接用第三方 `proper-skip-list` 而非自己造，避免在双向迭代、概率层级这些细节上引入 bug。详见 PROMPTS.md §1。

2. **后端金额一律存整数分（`priceCents`），不存任何派生量**：`Position` 只保留 `qty / totalCostCents / frozenQty` 三个整数字段，**不存均价**——均价是显示问题，让前端按需计算。摊销公式 `round(T*q/Q)` 在清仓时数学上恒为 0，跨周期无残留。整数化彻底规避浮点误差，从根上挡住"金融账目对不齐"。详见 PROMPTS.md §2。

3. **Pinia store 的 Map 走"整体替换快照"模式**：`s.value = new Map(s.value).set(k, v)`，不依赖 `reactive(Map)` 在不同 Vue 版本下的响应式覆盖。`market` / `orders` / `portfolio` 三个 store 统一用这个模式，意图直白——触发响应式的是赋值不是 `.set()`。详见 PROMPTS.md §4。

## 启动

### Docker 一键启动（推荐）

```bash
docker compose up --build
```

访问 [http://localhost:8080](http://localhost:8080)。前端 nginx 反代 `/api` 与 `/ws` 到 `backend:3000`。

种子用户：`root/123456`、`alice/alice`、`bob/bob`，每人 100 万虚拟币 + 每只股票 1000 股。

### 本地开发

```bash
# 终端 1
cd back-end && npm install && npm run dev
# 终端 2
cd front-end && npm install && npm run dev
```

后端 `:3000` 同时承载 REST 与 WS；前端 `:5173`（Vite 已配 `/api` `/ws` 代理）。

### 测试

```bash
cd back-end && npm test
```

vitest 共 24 个用例：撮合引擎 13 个（价格/时间优先、部分成交、taker 价格改善、自成交防护、撤单返还、清仓不变量）+ 跳表挂单簿 11 个（跨档排序、同价 FIFO、空档回收、双向迭代、买卖簿与多 symbol 隔离）。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/register` | 注册（自动赠送 100 万） |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/stocks` | 行情列表 |
| GET | `/api/orders` | 当前用户委托 |
| GET | `/api/orders/trades` | 当前用户成交 |
| POST | `/api/orders` | 下限价单 |
| DELETE | `/api/orders/:id` | 撤单 |
| GET | `/api/portfolio/me` | 资金 + 持仓 |
| GET | `/api/portfolio/trades` | 全市场最近成交 |
| WS | `/ws?token=…` | `hello` / `snapshot` / `quote` / `order` / `trade` / `portfolio` |

## 目录结构

```
trading-system/
├── docker-compose.yml
├── PROMPTS.md
├── front-end/                 Vue 3 + TS + Vite + Element Plus + Pinia
│   ├── Dockerfile / nginx.conf
│   └── src/
│       ├── api/               http (axios) / ws (指数退避重连) / orders / portfolio / stocks
│       ├── components/        MarketPanel / OrderForm / OrdersPanel / PortfolioPanel / TradesPanel
│       ├── stores/            market / orders / portfolio / publicTrades / user
│       ├── views/             Login / Home
│       └── router/            登录守卫
└── back-end/                  Express + ws + TypeScript
    ├── Dockerfile
    └── src/
        ├── index.ts           HTTP + WS 同 server
        ├── routes/            auth / stocks / orders / portfolio
        ├── middleware/auth.ts JWT
        ├── store/             users / orders (跳表挂单簿 + 单测) / stocks / reservation
        ├── engine/            matcher (+ 单测) / ticker
        ├── types/             第三方库类型补丁（proper-skip-list）
        └── ws/hub.ts          鉴权 + 行情广播 + 私有推送 + 重连快照
```

## 加分项

- **Docker 一键启动**：`docker-compose.yml` + 多阶段 Dockerfile + nginx 反代。
- **撮合引擎与跳表单测**：共 24 用例——撮合 13 个（`back-end/src/engine/matcher.test.ts`，覆盖价格/时间优先、部分成交、taker 价格改善、自成交防护、撤单返还、清仓不变量），跳表挂单簿 11 个（`back-end/src/store/orders.test.ts`，覆盖跨档排序、同价 FIFO、空档回收、双向迭代、买卖簿与多 symbol 隔离）。
- **WS 断线重连**：客户端指数退避（1/2/4/8s，上限 10s）；服务端在每条新连接握手时下发 `snapshot`，重连后客户端直接对齐。
