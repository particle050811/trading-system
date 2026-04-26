# 股票模拟交易系统

Vue 3 + TypeScript 前端 / Node.js + Express + ws 后端 / 内存撮合引擎 / WebSocket 实时推送。

仓库地址：<https://github.com/particle050811/trading-system>

关键架构决策与 AI 协作记录见 [PROMPTS.md](./PROMPTS.md)。

## 关键架构决策

1. **挂单簿用"跳表 + 同价位双向链表"两层结构**：跳表按价格排序，每个价位下挂一条同价队列（双向链表，先到的在头部）。撮合从最优价档往外扫，撤单和 maker 出簿都是常数时间。两种结构选型刚好相反——**跳表装库**（`proper-skip-list`，自己写细节多容易出 bug）；**链表手写**（30 行写完，JS 生态没有侵入式链表的库，装一个外部库还得维护"订单 → 节点"反向查找表反而更绕）。链表前后指针挂在订单对象上，用 Symbol 作 key，不会被 JSON 序列化泄漏到 API 响应。详见 PROMPTS.md §1、§5。

2. **后端金额一律存整数分，不存任何推导值**：浮点小数在金融账面上会累积误差，所以全部用"分"存。持仓只留三个整数字段（股数、总成本、冻结股数），**不存均价**——均价让前端按需计算。卖出按比例扣成本时，清仓那一笔数学上精确归零、跨周期不残留。详见 PROMPTS.md §2。

3. **前端响应式 Map 走"整体替换"模式**：Vue 的 ref 包 Map 时，调内部 `.set()` 不会触发界面刷新，所以每次更新克隆一份新 Map 再赋值。行情、委托、持仓三个 store 都用这个写法——直接看代码就知道触发刷新的是赋值不是 `.set()`。详见 PROMPTS.md §4。

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

vitest 共 24 个用例：撮合 13 个（价格优先、时间优先、部分成交、买方价格改善、自成交防护、撤单返还、清仓不残留）+ 挂单簿 11 个（跨档排序、同价队列、空档回收、双向遍历、买卖簿与多股票隔离）。

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
        ├── store/             users / orders (跳表挂单簿 + 单测) / dlist (同价 FIFO 链表) / stocks / reservation
        ├── engine/            matcher (+ 单测) / ticker
        ├── types/             第三方库类型补丁（proper-skip-list）
        └── ws/hub.ts          鉴权 + 行情广播 + 私有推送 + 重连快照
```

## 加分项

- **Docker 一键启动**：`docker-compose.yml` + 多阶段 Dockerfile + nginx 反代。
- **撮合引擎与挂单簿单测**：共 24 用例——撮合 13 个（`back-end/src/engine/matcher.test.ts`，覆盖价格优先、时间优先、部分成交、买方价格改善、自成交防护、撤单返还、清仓不残留），挂单簿 11 个（`back-end/src/store/orders.test.ts`，覆盖跨档排序、同价队列、空档回收、双向遍历、买卖簿与多股票隔离）。
- **WS 断线重连**：客户端断开后等 1/2/4/8 秒（上限 10 秒）逐步退让重连；服务端在每条新连接建立时下发一份完整快照（用户委托、成交、资金、持仓），客户端用快照整体覆盖本地状态，弥补断线期间错过的推送。
