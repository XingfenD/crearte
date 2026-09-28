<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { session } from '@/auth'
import { AUTH_ERROR_MESSAGES, toUserMessage } from '@/auth/errors'
import { validateDisplayName, validateEmail, validatePassword, validateUsername } from '@/auth/validation'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

const router = useRouter()
const email = ref('')
const username = ref('')
const displayName = ref('')
const password = ref('')
const error = ref<string | null>(null)
const errorField = ref<'email' | 'username' | 'name' | 'password' | null>(null)
const busy = ref(false)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = null
  errorField.value = null
  if (validateEmail(email.value)) {
    error.value = AUTH_ERROR_MESSAGES.invalid_email
    errorField.value = 'email'
    return
  }
  if (validateUsername(username.value)) {
    error.value = AUTH_ERROR_MESSAGES.invalid_username
    errorField.value = 'username'
    return
  }
  if (validateDisplayName(displayName.value)) {
    error.value = AUTH_ERROR_MESSAGES.invalid_display_name
    errorField.value = 'name'
    return
  }
  if (validatePassword(password.value)) {
    error.value = AUTH_ERROR_MESSAGES.weak_password
    errorField.value = 'password'
    return
  }
  busy.value = true
  try {
    await session.register(email.value.trim().toLowerCase(), username.value, displayName.value.trim(), password.value)
    await router.replace('/')
  } catch (e) {
    error.value = toUserMessage(e)
    errorField.value = null
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
        <BaseInput
          id="register-email"
          v-model="email"
          type="email"
          autocomplete="email"
          :invalid="errorField === 'email'"
          :aria-describedby="errorField === 'email' ? 'register-error' : undefined"
        />
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-username">用户名（小写字母、数字或连字符，注册后不可改）</label>
        <BaseInput
          id="register-username"
          v-model="username"
          type="text"
          autocomplete="username"
          maxlength="39"
          :invalid="errorField === 'username'"
          :aria-describedby="errorField === 'username' ? 'register-error' : undefined"
        />
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-name">昵称</label>
        <BaseInput
          id="register-name"
          v-model="displayName"
          type="text"
          autocomplete="nickname"
          maxlength="60"
          :invalid="errorField === 'name'"
          :aria-describedby="errorField === 'name' ? 'register-error' : undefined"
        />
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[0.6875rem] tracking-[0.05em]" for="register-password">密码（10–128 个字符）</label>
        <BaseInput
          id="register-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          :invalid="errorField === 'password'"
          :aria-describedby="errorField === 'password' ? 'register-error' : undefined"
        />
      </div>
      <p v-if="error" id="register-error" role="alert" aria-live="polite" class="border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>
      <BaseButton type="submit" variant="ink" lift class="w-full" :disabled="busy">
        {{ busy ? '注册中…' : '注册' }}
      </BaseButton>
    </form>
    <p class="mt-4 text-xs text-ink-soft">
      已有账号？
      <RouterLink class="text-accent-ink underline decoration-2 underline-offset-2" to="/login">登录</RouterLink>
    </p>
  </section>
</template>
