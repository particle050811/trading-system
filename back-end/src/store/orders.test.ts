// 直接针对跳表挂单簿（store/orders.ts）的行为做单测，
// 不经过撮合路径——只验证「价格优先 + 同价 FIFO + 空档删除 + 跨档顺序」。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetForTests,
  getBook,
  getBookList,
  insertResting,
  removeResting,
} from './orders.js'
import type { Order, Side } from '../types.js'

const SYM = 'STK001'

let seq = 0

function mkOrder(side: Side, priceCents: number, qty: number, createdAt: number): Order {
  return {
    id: 'o' + ++seq,
    userId: 'u' + seq,
    symbol: SYM,
    side,
    priceCents,
    qty,
    filledQty: 0,
    status: 'open',
    createdAt,
  }
}

beforeEach(() => {
  __resetForTests()
  seq = 0
})

describe('跳表挂单簿：跨价档排序', () => {
  it('卖盘按价格升序展开，最低价排在最前', () => {
    const a = mkOrder('sell', 5200, 10, 1)
    const b = mkOrder('sell', 5050, 10, 2)
    const c = mkOrder('sell', 5100, 10, 3)
    insertResting(a)
    insertResting(b)
    insertResting(c)

    const book = getBook(SYM, 'sell')
    expect(book.map((o) => o.priceCents)).toEqual([5050, 5100, 5200])
  })

  it('买盘按价格降序展开，最高价排在最前', () => {
    const a = mkOrder('buy', 4900, 10, 1)
    const b = mkOrder('buy', 5000, 10, 2)
    const c = mkOrder('buy', 4950, 10, 3)
    insertResting(a)
    insertResting(b)
    insertResting(c)

    const book = getBook(SYM, 'buy')
    expect(book.map((o) => o.priceCents)).toEqual([5000, 4950, 4900])
  })
})

describe('跳表挂单簿：同价位 FIFO（时间优先）', () => {
  it('同一价档的多笔单按插入顺序排队', () => {
    const a = mkOrder('sell', 5100, 10, 1)
    const b = mkOrder('sell', 5100, 10, 2)
    const c = mkOrder('sell', 5100, 10, 3)
    insertResting(a)
    insertResting(b)
    insertResting(c)

    const book = getBook(SYM, 'sell')
    expect(book).toEqual([a, b, c])
  })

  it('跨档展开时，同档内仍保持 FIFO，不与价格优先冲突', () => {
    const high1 = mkOrder('buy', 5000, 10, 1)
    const high2 = mkOrder('buy', 5000, 10, 2)
    const low1 = mkOrder('buy', 4900, 10, 3)
    insertResting(high1)
    insertResting(low1)
    insertResting(high2)

    expect(getBook(SYM, 'buy')).toEqual([high1, high2, low1])
  })
})

describe('跳表挂单簿：删除与空档回收', () => {
  it('删除同档内中间一笔不影响其他单的顺序', () => {
    const a = mkOrder('sell', 5100, 10, 1)
    const b = mkOrder('sell', 5100, 10, 2)
    const c = mkOrder('sell', 5100, 10, 3)
    insertResting(a)
    insertResting(b)
    insertResting(c)

    removeResting(b)
    expect(getBook(SYM, 'sell')).toEqual([a, c])
  })

  it('一档被删空后，跳表里这个价格键也被移除（不留空档）', () => {
    const a = mkOrder('sell', 5100, 10, 1)
    const b = mkOrder('sell', 5200, 10, 2)
    insertResting(a)
    insertResting(b)

    const book = getBookList(SYM, 'sell')
    expect(book.has(5100)).toBe(true)

    removeResting(a)
    expect(book.has(5100)).toBe(false)
    expect(book.has(5200)).toBe(true)
    expect(getBook(SYM, 'sell')).toEqual([b])
  })

  it('对同一笔订单重复 removeResting 是幂等的（第二次无副作用）', () => {
    const a = mkOrder('buy', 5000, 10, 1)
    insertResting(a)
    removeResting(a)
    removeResting(a)
    expect(getBook(SYM, 'buy')).toEqual([])
  })

  it('removeResting 一笔不存在的订单不抛错', () => {
    const ghost = mkOrder('buy', 5000, 10, 1)
    expect(() => removeResting(ghost)).not.toThrow()
    expect(getBook(SYM, 'buy')).toEqual([])
  })
})

describe('跳表挂单簿：买卖簿互不污染 / 多 symbol 隔离', () => {
  it('同价但不同方向，分别落在 bids / asks 两棵跳表', () => {
    const buy = mkOrder('buy', 5100, 10, 1)
    const sell = mkOrder('sell', 5100, 10, 2)
    insertResting(buy)
    insertResting(sell)

    expect(getBook(SYM, 'buy')).toEqual([buy])
    expect(getBook(SYM, 'sell')).toEqual([sell])
  })

  it('不同 symbol 的挂单簿相互隔离', () => {
    const a = mkOrder('sell', 5100, 10, 1)
    const b = { ...mkOrder('sell', 5100, 10, 2), symbol: 'STK002' }
    insertResting(a)
    insertResting(b)

    expect(getBook(SYM, 'sell')).toEqual([a])
    expect(getBook('STK002', 'sell')).toEqual([b])
  })
})

describe('跳表挂单簿：底层迭代器双向遍历', () => {
  it('findEntriesFromMin 升序、findEntriesFromMax 降序，价格档完整可见', () => {
    insertResting(mkOrder('sell', 5300, 10, 1))
    insertResting(mkOrder('sell', 5100, 10, 2))
    insertResting(mkOrder('sell', 5200, 10, 3))

    const list = getBookList(SYM, 'sell')
    const asc: number[] = []
    for (const [p] of list.findEntriesFromMin()) asc.push(p)
    const desc: number[] = []
    for (const [p] of list.findEntriesFromMax()) desc.push(p)

    expect(asc).toEqual([5100, 5200, 5300])
    expect(desc).toEqual([5300, 5200, 5100])
  })
})
