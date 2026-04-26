// 第三方库 proper-skip-list 没有官方类型定义，按 README 声明用到的子集。
declare module 'proper-skip-list' {
  export default class ProperSkipList<K extends number | string = number, V = unknown> {
    constructor(options?: { stackUpProbability?: number; updateLength?: boolean })
    readonly length: number | undefined
    upsert(key: K, value: V): void
    find(key: K): V | undefined
    has(key: K): boolean
    extract(key: K): V | undefined
    delete(key: K): boolean
    findEntries(fromKey: K): {
      matchingValue: V | undefined
      asc: IterableIterator<[K, V, number]>
      desc: IterableIterator<[K, V, number]>
    }
    findEntriesFromMin(): IterableIterator<[K, V, number]>
    findEntriesFromMax(): IterableIterator<[K, V, number]>
    minKey(): K | undefined
    maxKey(): K | undefined
    minValue(): V | undefined
    maxValue(): V | undefined
    deleteRange(fromKey: K | null, toKey: K | null, deleteLeft?: boolean, deleteRight?: boolean): void
    clear(): void
  }
}
