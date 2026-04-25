<script setup lang="ts">
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'

const user = useUserStore()
const router = useRouter()

function logout() {
  user.logout()
  router.push('/login')
}
</script>

<template>
  <el-container class="home">
    <el-header class="header">
      <span class="title">股票模拟交易系统</span>
      <div class="right">
        <span>{{ user.username }}</span>
        <el-button size="small" @click="logout">退出</el-button>
      </div>
    </el-header>
    <el-main>
      <el-empty description="行情 / 交易面板待实现" />
    </el-main>
  </el-container>
</template>

<style scoped>
.home {
  height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}
.title {
  font-size: 18px;
  font-weight: 600;
}
.right {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
