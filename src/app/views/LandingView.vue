<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'

const SLOGAN = 'STATIC WEB GAMES'
const TAGLINE = '收集可直接开玩的静态网页游戏 · 打开即玩、无需安装'

const { data: games } = useAsync<GameSummary[]>(() => repo.listGames())

const total = computed(() => games.value?.length ?? 0)

const stats = computed(() => {
  const list = games.value ?? []
  if (!list.length) return null
  const dates = list.map((game) => game.addedAt).sort()
  return { types: new Set(list.map((game) => game.type)).size, latest: dates[dates.length - 1] ?? '' }
})
</script>

<template>
  <section class="border-[3px] border-ink bg-surface px-6 py-10 text-center shadow-hard sm:px-10 sm:py-14">
    <h1 class="font-display text-4xl leading-none font-black tracking-tight sm:text-5xl md:text-6xl">crearte</h1>
    <p class="mt-3 font-mono text-[0.6875rem] tracking-[0.3em] text-ink-soft">{{ SLOGAN }}</p>
    <div class="mx-auto my-5 h-[3px] w-16 bg-ink"></div>
    <p class="text-sm text-ink-soft">{{ TAGLINE }}</p>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <RouterLink to="/games" class="btn-ink lift hover:shadow-hard active:shadow-none">进入游戏目录</RouterLink>
      <RouterLink to="/docs/about" class="btn-surface lift hover:shadow-hard active:shadow-none">关于本站</RouterLink>
    </div>
    <p v-if="stats" class="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">
      <span>收录 {{ total }} 款</span>
      <span>{{ stats.types }} 种类型</span>
      <span>更新 {{ stats.latest }}</span>
    </p>
  </section>
</template>
