<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { session } from '@/auth'
import { AUTH_ERROR_MESSAGES, toUserMessage } from '@/auth/errors'
import { validateDisplayName, validateEmail, validatePassword } from '@/auth/validation'

const router = useRouter()
const email = ref('')
const displayName = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = null
  const code = validateEmail(email.value) ?? validateDisplayName(displayName.value) ?? validatePassword(password.value)
  if (code) {
    error.value = AUTH_ERROR_MESSAGES[code]
    return
  }
  busy.value = true
  try {
    await session.register(email.value.trim().toLowerCase(), displayName.value.trim(), password.value)
    await router.replace('/')
  } catch (e) {
    error.value = toUserMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-md px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">注册</h1>
    <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-email">邮箱</label>
        <input
          id="register-email"
          v-model="email"
          type="email"
          autocomplete="email"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-name">昵称</label>
        <input
          id="register-name"
          v-model="displayName"
          type="text"
          autocomplete="nickname"
          maxlength="60"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-password">密码（10–128 个字符）</label>
        <input
          id="register-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          class="w-full border-2 border-ink bg-surface px-3 py-2"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <p v-if="error" role="alert" aria-live="polite" class="border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>
      <button type="submit" class="btn-ink lift w-full disabled:opacity-50" :disabled="busy">
        {{ busy ? '注册中…' : '注册' }}
      </button>
    </form>
    <p class="mt-4 text-xs text-ink-soft">
      已有账号？
      <RouterLink class="text-accent-ink underline decoration-2 underline-offset-2" to="/login">登录</RouterLink>
    </p>
  </section>
</template>
