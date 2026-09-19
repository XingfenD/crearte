<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { pickFeatured } from '@/lib/featured'
import GameCard from '@/components/GameCard.vue'
import StatePanel from '@/components/StatePanel.vue'

const SLOGAN = 'STATIC WEB GAMES'
const TAGLINE = '收集可直接开玩的静态网页游戏 · 打开即玩、无需安装'
const FEATURED_LIMIT = 6

const { data: games, error, loading, reload } = useAsync<GameSummary[]>(() => repo.listGames())

const total = computed(() => games.value?.length ?? 0)
const featured = computed(() => pickFeatured(games.value ?? [], FEATURED_LIMIT))

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

  <section class="mt-8">
    <div class="flex items-baseline gap-2">
      <h2 class="font-mono text-[0.6875rem] font-bold tracking-[0.08em]">精选 · SELECTED</h2>
      <RouterLink v-if="featured.length" to="/games" class="ml-auto text-xs text-ink-soft underline">
        查看全部 {{ total }} 款 →
      </RouterLink>
    </div>
    <StatePanel :loading="loading" :error="error" @retry="reload">
      <div v-if="featured.length" class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <GameCard v-for="game in featured" :key="game.id" :game="game" />
      </div>
      <p v-else class="mt-3 border-2 border-dashed border-ink p-10 text-center text-sm text-ink-soft">
        还没有收录游戏。
      </p>
    </StatePanel>
  </section>
</template>
