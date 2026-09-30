<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { authEnabled, session } from '@/auth'

const SLOGAN = 'SHARE YOUR CREATIONS'
const TAGLINE = '把你的作品分享给所有人'

const user = computed(() => session.state.user)
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

  <section class="mt-8 flex flex-col gap-4 sm:flex-row">
    <h2 class="sr-only">创作者中心</h2>
    <section class="flex-1 border-2 border-ink bg-surface p-4 shadow-hard-sm">
      <h3 class="text-sm font-black">作品数据</h3>
      <p class="mt-2 text-xs leading-relaxed text-ink-soft">
        <template v-if="authEnabled && !user">登录后即可查看您作品的数据。<RouterLink :to="{ path: '/login', query: { next: '/creator' } }" class="underline">登录</RouterLink></template>
        <template v-else-if="authEnabled">数据面板正在建设中。上线后将展示您作品的浏览、下载与评分。</template>
        <template v-else>数据面板正在建设中。</template>
      </p>
    </section>
  </section>
</template>
