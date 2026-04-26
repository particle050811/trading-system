import express from 'express'
import cors from 'cors'
import http from 'node:http'
import { config } from './config.js'
import authRouter from './routes/auth.js'
import stocksRouter from './routes/stocks.js'
import ordersRouter from './routes/orders.js'
import portfolioRouter from './routes/portfolio.js'
import { attachWs } from './ws/hub.js'
import { startTicker } from './engine/ticker.js'

const app = express()
app.use(cors())
app.use(express.json())

// REST 路由：健康检查 + 鉴权 + 行情 + 委托 + 账户。
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/stocks', stocksRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/portfolio', portfolioRouter)

// 用同一个 HTTP server 同时承载 Express 和 WebSocket（path = /ws），
// 并启动 1 秒间隔的行情心跳器（随机游走 + 广播）。
const server = http.createServer(app)
attachWs(server)
startTicker(1000)

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`)
  console.log(`[ws]     ws://localhost:${config.port}/ws`)
})
