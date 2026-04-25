# 股票模拟交易系统

Vue 3 + TypeScript 前端 / Node.js + Express + ws 后端 / 内存撮合引擎 / WebSocket 实时推送。

## 启动方式

需要分别启动前后端（两个终端）。

### 后端

```bash
cd back-end
npm install
npm run dev
```

监听 `http://localhost:3000`，WebSocket 在 `ws://localhost:3000/ws`。

### 前端

```bash
cd front-end
npm install
npm run dev
```

访问 `http://localhost:5173`。Vite 已配置代理：`/api/*` → `:3000`，`/ws` → `ws://:3000/ws`，前端代码使用相对路径，无 CORS。

## 目录结构

```
trading-system/
├── front-end/                    Vue 3 + TS + Vite + Element Plus + Pinia + Vue Router
│   ├── src/
│   │   ├── api/http.ts           axios 实例 + 鉴权拦截器
│   │   ├── router/index.ts       路由 + 登录守卫
│   │   ├── stores/user.ts        Pinia 用户态(token 持久化到 localStorage)
│   │   ├── views/
│   │   │   ├── Login.vue         登录 / 注册
│   │   │   └── Home.vue          主页(行情/交易面板待实现)
│   │   ├── types/                类型定义
│   │   ├── utils/                工具
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── style.css
│   ├── vite.config.ts            @ 别名 + /api、/ws 代理
│   └── tsconfig.app.json
│
└── back-end/                     Express + ws + TypeScript
    ├── src/
    │   ├── index.ts              入口(HTTP + WebSocket server)
    │   ├── config.ts             端口、JWT 密钥、初始资金
    │   ├── routes/
    │   │   └── auth.ts           登录 / 注册
    │   ├── middleware/
    │   │   └── auth.ts           JWT 校验 + 签发
    │   ├── store/
    │   │   └── users.ts          用户内存仓(含资金、持仓)
    │   ├── engine/               撮合引擎(待实现)
    │   ├── ws/                   WebSocket 推送(待实现)
    │   └── types/
    └── tsconfig.json
```

## 已实现 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/register` | 注册，返回 `{ token, username }`，自动赠送 100 万初始资金 |
| POST | `/api/auth/login` | 登录 |
| WS | `/ws` | 连接后接收 `{ type: "hello" }`(后续会推送行情/委托/持仓变更) |

## 待实现

- [ ] 行情看板(≥3 支股票，每秒随机波动)
- [ ] 撮合引擎(限价单，价格优先 + 时间优先)
- [ ] 交易面板(下单、委托列表、持仓列表)
- [ ] 成交记录
- [ ] WebSocket 行情 / 委托 / 持仓 / 成交推送

## 关键架构决策

待补充(完成核心功能后总结 2~3 条)。
