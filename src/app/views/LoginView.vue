<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { session } from '@/auth'
import { AUTH_ERROR_MESSAGES, toUserMessage } from '@/auth/errors'
import { sanitizeNext, validateEmail } from '@/auth/validation'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = null
  const emailError = validateEmail(email.value)
  if (emailError) {
    error.value = AUTH_ERROR_MESSAGES[emailError]
    return
  }
  if (password.value === '') {
    error.value = '请输入密码'
    return
  }
  busy.value = true
  try {
    await session.login(email.value.trim().toLowerCase(), password.value)
    await router.replace(sanitizeNext(route.query.next))
  } catch (e) {
    error.value = toUserMessage(e)
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-md px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">登录</h1>
    <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="login-email">邮箱</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          autocomplete="email"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="login-password">密码</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <p v-if="error" role="alert" aria-live="polite" class="border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>
      <button type="submit" class="btn-ink lift w-full disabled:opacity-50" :disabled="busy">
        {{ busy ? '登录中…' : '登录' }}
      </button>
    </form>
    <p class="mt-4 text-xs text-ink-soft">
      没有账号？
      <RouterLink class="text-accent-ink underline decoration-2 underline-offset-2" to="/register">注册</RouterLink>
    </p>
  </section>
</template>
