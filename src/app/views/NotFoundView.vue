<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 text-center">
    <h1 class="font-display text-[clamp(2.25rem,6vw,3.25rem)] font-black leading-[1.05]">
      404<span class="sr-only">：页面不存在</span>
    </h1>
    <p class="-rotate-6 border-[2.5px] border-accent-ink px-3 py-1 font-mono text-xs font-bold tracking-[0.2em] text-accent-ink">
      PAGE NOT FOUND
    </p>
    <p class="text-sm text-ink-soft">页面不存在。</p>
    <RouterLink to="/games" class="btn-ink lift hover:shadow-hard active:shadow-none">返回目录</RouterLink>
  </div>
</template>
