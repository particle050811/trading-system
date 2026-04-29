import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem('token') ?? '')
  const username = ref<string>(localStorage.getItem('username') ?? '')
  // userId 由 WS hello 消息回填，用于判断成交对手方是否是自己。
  // 不持久化：每次 WS 重连都会重新下发 hello。
  const userId = ref<string>('')

  function setAuth(t: string, name: string) {
    token.value = t
    username.value = name
    localStorage.setItem('token', t)
    localStorage.setItem('username', name)
  }

  function setUserId(id: string) {
    userId.value = id
  }

  function logout() {
    token.value = ''
    username.value = ''
    userId.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('username')
  }

  return { token, username, userId, setAuth, setUserId, logout }
})
