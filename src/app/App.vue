<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
import ToastHost from '@/components/ToastHost.vue'
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
