# 股票模拟交易系统

Vue 3 + TypeScript 前端 / Node.js + Express + ws 后端 / 内存撮合引擎 / WebSocket 实时推送。

关键架构决策与 AI 协作记录见 [PROMPTS.md](./PROMPTS.md)。

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

vitest 撮合引擎单测 13 个用例，覆盖价格/时间优先、部分成交、taker 价格改善、自成交防护、撤单返还、清仓不变量。

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
        ├── store/             users / orders / stocks / reservation
        ├── engine/            matcher (+ test) / ticker
        └── ws/hub.ts          鉴权 + 行情广播 + 私有推送 + 重连快照
```

## 加分项

- **Docker 一键启动**：`docker-compose.yml` + 多阶段 Dockerfile + nginx 反代。
- **撮合引擎单测**：13 用例，详见 `back-end/src/engine/matcher.test.ts`。
- **WS 断线重连**：客户端指数退避（1/2/4/8s，上限 10s）；服务端在每条新连接握手时下发 `snapshot`，重连后客户端直接对齐。
