import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { findById } from '../store/users.js'

export interface AuthedRequest extends Request {
  userId?: string
}

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未登录' })
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string }
    if (!findById(payload.sub)) return res.status(401).json({ message: '用户不存在' })
    req.userId = payload.sub
    next()
  } catch {
    return res.status(401).json({ message: 'token 无效' })
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' })
}
