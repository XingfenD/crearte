<script setup lang="ts">
import { RouterLink } from 'vue-router'

const SLOGAN = 'SHARE YOUR CREATIONS'
const TAGLINE = '把你的作品分享给所有人'
</script>

<template>
  <section class="border-[3px] border-ink bg-surface px-6 py-10 text-center shadow-hard sm:px-10 sm:py-14">
    <span class="inline-block bg-ink px-2 py-1 text-[0.6875rem] font-bold tracking-[0.3em] text-paper">创作者</span>
    <h1 class="mt-3 font-display text-4xl leading-none font-black tracking-tight sm:text-5xl md:text-6xl">创作者中心</h1>
    <p class="mt-3 font-mono text-[0.6875rem] tracking-[0.3em] text-ink-soft">{{ SLOGAN }}</p>
    <div class="mx-auto my-5 h-[3px] w-16 bg-ink"></div>
    <p class="text-sm text-ink-soft">{{ TAGLINE }}</p>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <RouterLink to="/submit/new" class="btn-ink lift hover:shadow-hard active:shadow-none">提交作品</RouterLink>
      <RouterLink to="/docs/contribute" class="btn-surface lift hover:shadow-hard active:shadow-none">投稿指南</RouterLink>
    </div>
  </section>
</template>
