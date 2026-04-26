import type { Order } from '../types.js'

// 同价档 FIFO 的侵入式双向链表节点指针。
//
// 为什么用 Symbol 作 key 而不是普通字段？
//   - 同价档相邻挂单互相引用（A.next = B, B.prev = A）会形成循环引用，
//     JSON.stringify 直接抛 "Converting circular structure to JSON"；
//   - 普通字段会被默认序列化进 REST 响应 / WS 推送，泄漏内部状态；
//   - Symbol-keyed 属性默认不参与 JSON 序列化，也不出现在 Object.keys，
//     天然对外不可见，调用方无需写白名单 / toJSON。
//
// 这两个 Symbol 仅在 store/orders.ts 内部读写，撮合 matcher.ts 只通过
// nextNode / unlinkNode / appendNode 这组工具函数访问。
const PREV: unique symbol = Symbol('order.prev')
const NEXT: unique symbol = Symbol('order.next')

// 给 Order 在运行时打上链表指针，类型上保持 Order 干净。
type LinkedOrder = Order & {
  [PREV]?: Order | null
  [NEXT]?: Order | null
}

// 一个价格档的同价 FIFO 链表：head 最早挂入，tail 最新挂入。
export interface PriceLevel {
  head: Order | null
  tail: Order | null
  size: number
}

export function createLevel(): PriceLevel {
  return { head: null, tail: null, size: 0 }
}

// 把订单追加到链表尾部 —— 时间优先：先来的留在 head 一侧。O(1)。
export function appendNode(level: PriceLevel, order: Order): void {
  const o = order as LinkedOrder
  o[PREV] = level.tail
  o[NEXT] = null
  if (level.tail) {
    ;(level.tail as LinkedOrder)[NEXT] = order
  } else {
    level.head = order
  }
  level.tail = order
  level.size++
}

// 把任意节点从所在链表中解链 —— 撤单 / maker 完全成交都走这里。O(1)。
// 解链后清空指针，重复调用幂等（再调用 prev/next 都是 null，不会重复减 size）。
export function unlinkNode(level: PriceLevel, order: Order): void {
  const o = order as LinkedOrder
  const prev = o[PREV] ?? null
  const next = o[NEXT] ?? null
  // 节点不在任何链表里：head 不是它、tail 不是它、prev/next 又都为 null。
  // 用「头/尾命中」或「prev/next 非空」判定才能避免幽灵节点错误地把 size--。
  const inList = level.head === order || level.tail === order || prev !== null || next !== null
  if (!inList) return

  if (prev) (prev as LinkedOrder)[NEXT] = next
  else level.head = next
  if (next) (next as LinkedOrder)[PREV] = prev
  else level.tail = prev

  o[PREV] = null
  o[NEXT] = null
  level.size--
}

// 撮合循环用：取下一个节点（不解链），用于自成交跳过场景。
export function nextNode(order: Order): Order | null {
  return (order as LinkedOrder)[NEXT] ?? null
}

// 把链表展开成数组，仅供 getBook 等公开查询/单测使用，不要在撮合热路径调用。
export function levelToArray(level: PriceLevel): Order[] {
  const out: Order[] = []
  let cur = level.head
  while (cur) {
    out.push(cur)
    cur = (cur as LinkedOrder)[NEXT] ?? null
  }
  return out
}
