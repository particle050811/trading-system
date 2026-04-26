import http from './http'
import type { Stock } from '@/types'

// GET /api/stocks：拉取行情列表（首屏初始数据，后续靠 WS quote 增量）。
export function fetchStocks() {
  return http.get<any, { stocks: Stock[] }>('/stocks')
}
