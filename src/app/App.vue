<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-neutral-800">
      <div class="mx-auto max-w-6xl w-full px-4 h-14 flex items-center gap-6">
        <RouterLink to="/" class="font-semibold tracking-wide">网页游戏收藏馆</RouterLink>
        <nav class="flex gap-4 text-sm text-neutral-400">
          <RouterLink to="/" class="hover:text-neutral-100" exact-active-class="text-neutral-100">游戏</RouterLink>
          <RouterLink to="/docs" class="hover:text-neutral-100" active-class="text-neutral-100">文档</RouterLink>
        </nav>
      </div>
    </header>
    <main class="flex-1 mx-auto max-w-6xl w-full px-4 py-6">
      <RouterView />
    </main>
    <footer class="border-t border-neutral-800 text-xs text-neutral-500">
      <div class="mx-auto max-w-6xl w-full px-4 py-4">
        数据来自社区 PR 收录，游戏版权归原作者所有。
      </div>
    </footer>
  </div>
</template>
