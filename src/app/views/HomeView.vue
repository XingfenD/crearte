<script setup lang="ts">
import { computed } from 'vue'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { useFilterState } from '@/composables/useFilterState'
import { filterGames } from '@/lib/filter'
import GameCard from '@/components/GameCard.vue'
import GameFilters from '@/components/GameFilters.vue'
import StatePanel from '@/components/StatePanel.vue'

const { data: games, error, loading, reload } = useAsync<GameSummary[]>(() => repo.listGames())
const { state } = useFilterState()
const visible = computed(() => filterGames(games.value ?? [], state.value))
</script>

<template>
  <StatePanel :loading="loading" :error="error" @retry="reload">
    <div class="space-y-6">
      <GameFilters v-if="games?.length" :games="games" />
      <div v-if="visible.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <GameCard v-for="game in visible" :key="game.id" :game="game" />
      </div>
      <div v-else class="py-24 text-center text-neutral-500">
        {{ games?.length ? '没有匹配的游戏，试试调整筛选条件。' : '还没有收录游戏。' }}
      </div>
    </div>
  </StatePanel>
</template>
