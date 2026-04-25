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
    if (err.response?.status === 401) {
      useUserStore().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default http
