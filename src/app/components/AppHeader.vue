<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { repo, type DocMeta, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'

const route = useRoute()
const onCatalog = computed(() => route.name === 'catalog')
const showGameCount = computed(() => route.name === 'catalog' || route.name === 'home')
const onDocs = computed(() => route.name === 'docs' || route.name === 'doc')

const { data: games } = useAsync<GameSummary[] | null>(
  () => (showGameCount.value ? repo.listGames() : Promise.resolve(null)),
  [showGameCount]
)
const { data: docs } = useAsync<DocMeta[] | null>(
  () => (onDocs.value ? repo.listDocs() : Promise.resolve(null)),
  [onDocs]
)

const sticker = computed(() => {
  if (showGameCount.value && games.value) return `共 ${games.value.length} 款`
  if (onDocs.value && docs.value) return `共 ${docs.value.length} 篇`
  return 'STATIC WEB GAMES'
})
</script>

<template>
  <header class="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
      <RouterLink to="/" class="bg-ink px-2 py-1 text-sm font-extrabold tracking-[0.04em] text-paper">
        crearte <span class="text-[0.6875rem] tracking-[0.2em]">创艺</span>
      </RouterLink>
      <nav class="flex gap-4 text-sm font-bold">
        <RouterLink
          to="/games"
          class="border-b-[3px] pb-0.5 text-sm font-bold"
          :class="onCatalog ? 'border-b-accent-ink text-accent-ink' : 'border-b-transparent text-ink-soft'"
          :aria-current="onCatalog ? 'page' : undefined"
        >游戏</RouterLink>
        <RouterLink
          to="/docs"
          class="border-b-[3px] pb-0.5 text-sm font-bold"
          :class="onDocs ? 'border-b-accent-ink text-accent-ink' : 'border-b-transparent text-ink-soft'"
          :aria-current="onDocs ? 'page' : undefined"
        >文档</RouterLink>
      </nav>
      <span
        class="ml-auto hidden border-2 border-ink bg-highlight px-2 py-0.5 font-mono text-[0.6875rem] tracking-[0.05em] sm:inline-block"
      >{{ sticker }}</span>
    </div>
  </header>
</template>
