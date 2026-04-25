import { Router } from 'express'
import { createUser, findByUsername } from '../store/users.js'
import { signToken } from '../middleware/auth.js'

const router = Router()

router.post('/register', (req, res) => {
  const { username, password } = req.body ?? {}
  if (!username || !password) return res.status(400).json({ message: '缺少用户名或密码' })
  if (findByUsername(username)) return res.status(409).json({ message: '用户名已存在' })
  const user = createUser(username, password)
  return res.json({ token: signToken(user.id), username: user.username })
})

router.post('/login', (req, res) => {
  const { username, password } = req.body ?? {}
  if (!username || !password) return res.status(400).json({ message: '缺少用户名或密码' })
  const user = findByUsername(username)
  if (!user || user.password !== password) {
    return res.status(401).json({ message: '用户名或密码错误' })
  }
  return res.json({ token: signToken(user.id), username: user.username })
})

export default router
