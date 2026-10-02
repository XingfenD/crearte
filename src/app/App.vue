<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
import ToastHost from '@/components/ToastHost.vue'
import { applyTheme, useTheme } from '@/composables/useTheme'

// P13 D-K：内联 pre-paint 脚本已处理首屏；这里再落一次，覆盖内联脚本未执行的场景
//（e2e 直接操作 DOM、被 CSP 拦截等）。模板结构不动：skip-link 仍是根 div 首子（P9-B 钉桩）。
const { theme } = useTheme()
applyTheme(theme.value)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:border-2 focus:border-ink focus:bg-highlight focus:px-3 focus:py-2 focus:text-sm focus:font-extrabold focus:shadow-hard"
    >跳到主内容</a>
    <AppHeader />
    <main id="main" tabindex="-1" class="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">
      <RouterView />
    </main>
    <AppFooter />
    <ToastHost />
  </div>
</template>
