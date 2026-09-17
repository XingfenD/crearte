<script setup lang="ts">
import { computed, ref } from 'vue'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { DEFAULT_FILTER, filterGames } from '@/lib/filter'
import { useFilterState } from '@/composables/useFilterState'
import GameCard from '@/components/GameCard.vue'
import FilterSidebar from '@/components/FilterSidebar.vue'
import FilterDrawer from '@/components/FilterDrawer.vue'
import ResultMeta from '@/components/ResultMeta.vue'
import StatePanel from '@/components/StatePanel.vue'

const { data: games, error, loading, reload } = useAsync<GameSummary[]>(() => repo.listGames())
const { state, update } = useFilterState()
const visible = computed(() => filterGames(games.value ?? [], state.value))
const drawerOpen = ref(false)
</script>

<template>
  <StatePanel :loading="loading" :error="error" @retry="reload">
    <div class="flex items-start gap-6">
      <aside class="hidden w-[215px] shrink-0 self-stretch border-r-[3px] border-ink bg-surface p-4 lg:block">
        <FilterSidebar :games="games ?? []" />
      </aside>

      <div class="min-w-0 flex-1 space-y-4">
        <div class="relative">
          <label for="game-search" class="sr-only">搜索游戏</label>
          <PhMagnifyingGlass
            :size="16"
            weight="bold"
            aria-hidden="true"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            id="game-search"
            :value="state.q"
            type="search"
            placeholder="搜索游戏名、简介、作者或标签…"
            class="w-full appearance-none border-2 border-ink bg-surface py-2.5 pl-10 pr-3 text-sm shadow-hard-sm"
            @input="update({ q: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <ResultMeta :count="visible.length" @open-filters="drawerOpen = true" />

        <div v-if="visible.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <GameCard v-for="game in visible" :key="game.id" :game="game" />
        </div>
        <div v-else class="border-2 border-dashed border-ink p-10 text-center">
          <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">NO MATCH · 0 款</p>
          <p class="mt-3 text-sm text-ink-soft">
            {{ (games?.length ?? 0) > 0 ? '没有匹配的游戏，试试调整筛选条件。' : '还没有收录游戏。' }}
          </p>
          <button
            v-if="(games?.length ?? 0) > 0"
            type="button"
            class="btn-ink lift mt-5 hover:shadow-hard active:shadow-none"
            @click="update(DEFAULT_FILTER)"
          >重置筛选</button>
        </div>
      </div>
    </div>

    <FilterDrawer v-model:open="drawerOpen" :games="games ?? []" :count="visible.length" />
  </StatePanel>
</template>
