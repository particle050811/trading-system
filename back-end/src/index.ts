import express from 'express'
import cors from 'cors'
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { config } from './config.js'
import authRouter from './routes/auth.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)

const server = http.createServer(app)

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', message: 'connected' }))
})

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`)
  console.log(`[ws]     ws://localhost:${config.port}/ws`)
})
