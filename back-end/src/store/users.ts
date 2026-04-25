import { config } from '../config.js'

export interface Position {
  qty: number
  totalCostCents: number
}

export interface User {
  id: string
  username: string
  password: string
  cashCents: number
  positions: Map<string, Position>
}

const users = new Map<string, User>()

export function findByUsername(username: string): User | undefined {
  for (const u of users.values()) if (u.username === username) return u
}

export function findById(id: string): User | undefined {
  return users.get(id)
}

export function createUser(username: string, password: string): User {
  const id = crypto.randomUUID()
  const user: User = {
    id,
    username,
    password,
    cashCents: config.initialCashCents,
    positions: new Map(),
  }
  users.set(id, user)
  return user
}
