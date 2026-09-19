<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { session } from '@/auth'
import { AUTH_ERROR_MESSAGES, toUserMessage } from '@/auth/errors'
import { validatePassword } from '@/auth/validation'
import type { UserRole } from '@/auth/types'

const router = useRouter()
const user = computed(() => session.state.user)
const roleLabel = computed(() => (user.value ? ROLE_LABELS[user.value.role] : ''))

const ROLE_LABELS: Record<UserRole, string> = { user: '普通用户', admin: '管理员' }

const currentPassword = ref('')
const newPassword = ref('')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)
const confirmingLogoutAll = ref(false)

watch(
  () => session.state.status,
  (status) => {
    if (status !== 'authenticated') void router.replace({ name: 'login', query: { next: '/account' } })
  }
)

async function changePassword(): Promise<void> {
  if (busy.value || !user.value) return
  error.value = null
  notice.value = null
  const code = validatePassword(newPassword.value)
  if (code) {
    error.value = AUTH_ERROR_MESSAGES[code]
    return
  }
  if (currentPassword.value === '') {
    error.value = '请输入当前密码'
    return
  }
  busy.value = true
  try {
    await session.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    notice.value = '密码已更新，其他设备需要重新登录。'
  } catch (e) {
    error.value = toUserMessage(e)
  } finally {
    busy.value = false
  }
}

async function logoutAll(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    await session.logoutAll()
    confirmingLogoutAll.value = false
    await router.replace({ name: 'login' })
  } finally {
    busy.value = false
  }
}

function logout(): void {
  session.logout()
  void router.replace('/')
}
</script>

<template>
  <section class="mx-auto w-full max-w-xl px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">我的账号</h1>

    <dl v-if="user" class="mt-6 border-2 border-ink bg-surface p-4 shadow-hard">
      <div class="flex flex-wrap items-baseline gap-2">
        <dt class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">昵称</dt>
        <dd class="text-sm font-bold">{{ user.display_name }}</dd>
      </div>
      <div class="mt-2 flex flex-wrap items-baseline gap-2">
        <dt class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">邮箱</dt>
        <dd class="text-sm">{{ user.email }}</dd>
      </div>
      <div class="mt-2 flex flex-wrap items-baseline gap-2">
        <dt class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">角色</dt>
        <dd class="text-sm">{{ roleLabel }}</dd>
      </div>
    </dl>

    <form class="mt-8 space-y-4" novalidate @submit.prevent="changePassword">
      <h2 class="font-display text-lg font-black">修改密码</h2>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="account-current">当前密码</label>
        <input id="account-current" v-model="currentPassword" type="password" autocomplete="current-password" class="w-full border-2 border-ink bg-surface px-3 py-2">
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="account-new">新密码（10–128 个字符）</label>
        <input id="account-new" v-model="newPassword" type="password" autocomplete="new-password" class="w-full border-2 border-ink bg-surface px-3 py-2">
      </div>
      <p v-if="error" role="alert" aria-live="polite" class="border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>
      <p v-if="notice" role="status" aria-live="polite" class="border-2 border-ink bg-surface px-3 py-2 text-xs">{{ notice }}</p>
      <button type="submit" class="btn-ink lift disabled:opacity-50" :disabled="busy">更新密码</button>
    </form>

    <section class="mt-10 space-y-3 border-t-[3px] border-ink pt-6">
      <h2 class="font-display text-lg font-black">会话</h2>
      <p class="text-xs text-ink-soft">登出全部设备会让所有已签发的登录凭证立即失效（包括当前设备）。</p>
      <div v-if="confirmingLogoutAll" class="flex flex-wrap gap-2">
        <button type="button" class="btn-ink lift disabled:opacity-50" :disabled="busy" @click="logoutAll">确认登出全部</button>
        <button type="button" class="btn-surface lift" @click="confirmingLogoutAll = false">取消</button>
      </div>
      <button v-else type="button" class="btn-surface lift" @click="confirmingLogoutAll = true">登出全部设备</button>
      <button type="button" class="btn-surface lift ml-0 sm:ml-2" @click="logout">登出</button>
    </section>
  </section>
</template>
