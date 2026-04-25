import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem('token') ?? '')
  const username = ref<string>(localStorage.getItem('username') ?? '')

  function setAuth(t: string, name: string) {
    token.value = t
    username.value = name
    localStorage.setItem('token', t)
    localStorage.setItem('username', name)
  }

  function logout() {
    token.value = ''
    username.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('username')
  }

  return { token, username, setAuth, logout }
})
