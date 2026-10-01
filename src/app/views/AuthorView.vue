<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { repo, resolveUserSlug, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { DEFAULT_FILTER, filterGames } from '@/lib/filter'
import { authorDisplayName } from '@/lib/labels'
import { authorTitle, setPageTitle } from '@/lib/pageTitle'
import GameCard from '@/components/GameCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const props = defineProps<{ user: string }>()
const router = useRouter()
const { data: games, error, loading, reload } = useAsync<GameSummary[]>(() => repo.listGames())
const visible = computed(() =>
  filterGames((games.value ?? []).filter((g) => resolveUserSlug(g).user === props.user), DEFAULT_FILTER)
)

// 取首个作品的作者显示名；列表空时回退到路由 user
watch(games, (list) => {
  const first = (list ?? [])[0]
  setPageTitle(authorTitle(first ? authorDisplayName(first) : props.user))
})
</script>

<template>
  <StatePanel :loading="loading" :error="error" @retry="reload">
    <div class="space-y-4">
      <nav aria-label="面包屑" class="font-mono text-xs text-ink-soft">
        <RouterLink
          :to="{ name: 'catalog' }"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >目录</RouterLink>
        <span aria-hidden="true"> / </span>
        <span>@{{ props.user }}</span>
      </nav>

      <header class="space-y-1.5">
        <h1 class="font-display text-[2.125rem] font-black leading-[1.1]">@{{ props.user }}</h1>
        <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">{{ visible.length }} 款作品</p>
      </header>

      <div v-if="visible.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <GameCard v-for="game in visible" :key="game.id" :game="game" />
      </div>
      <div v-else class="border-2 border-dashed border-ink p-10 text-center">
        <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">NO WORKS · 0 款</p>
        <p class="mt-3 text-sm text-ink-soft">该作者暂无已上架作品</p>
        <BaseButton
          variant="ink"
          lift
          class="mt-5 hover:shadow-hard active:shadow-none"
          @click="router.push({ name: 'catalog' })"
        >返回目录</BaseButton>
      </div>
    </div>
  </StatePanel>
</template>
