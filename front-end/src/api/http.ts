import axios from 'axios'
import { useUserStore } from '@/stores/user'

const http = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

http.interceptors.request.use((config) => {
  const user = useUserStore()
  if (user.token) config.headers.Authorization = `Bearer ${user.token}`
  return config
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    // 401：把已登录用户踢回登录页。但鉴权接口本身的 401（用户名/密码错）不能走这个分支，
    // 否则整页跳转会吞掉调用方的 ElMessage 错误提示。
    const url: string = err.config?.url ?? ''
    const isAuthRoute = url.startsWith('/auth/')
    if (err.response?.status === 401 && !isAuthRoute) {
      useUserStore().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default http
