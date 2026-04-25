<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import http from '@/api/http'

const router = useRouter()
const user = useUserStore()
const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const form = reactive({ username: '', password: '' })

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const res = await http.post<any, { token: string; username: string }>(
      `/auth/${mode.value}`,
      form,
    )
    user.setAuth(res.token, res.username)
    ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功')
    router.push('/')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message ?? '操作失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrap">
    <el-card class="login-card">
      <h2>{{ mode === 'login' ? '登录' : '注册' }}</h2>
      <el-form @submit.prevent="submit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" show-password />
        </el-form-item>
        <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">
          {{ mode === 'login' ? '登录' : '注册' }}
        </el-button>
        <div class="switch">
          <el-link type="primary" @click="mode = mode === 'login' ? 'register' : 'login'">
            {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
          </el-link>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}
.login-card {
  width: 360px;
}
.switch {
  margin-top: 12px;
  text-align: center;
}
</style>
