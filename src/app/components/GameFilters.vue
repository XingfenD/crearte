<script setup lang="ts">
import { computed } from 'vue'
import type { GameSummary, GameType } from '@/data/types'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS } from '@/lib/labels'
import type { SortKey } from '@/lib/filter'
import { useFilterState } from '@/composables/useFilterState'

const props = defineProps<{ games: GameSummary[] }>()
const { state, update } = useFilterState()

const tagCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const game of props.games) for (const tag of game.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16)
})

function toggleTag(tag: string): void {
  const tags = state.value.tags.includes(tag)
    ? state.value.tags.filter((t) => t !== tag)
    : [...state.value.tags, tag]
  update({ tags })
}

const durationOptions = [
  { value: 'all', label: '全部时长' },
  { value: 'short', label: '≤5 分钟' },
  { value: 'mid', label: '5–30 分钟' },
  { value: 'long', label: '>30 分钟' }
] as const
</script>

<template>
  <div class="space-y-4">
    <input
      :value="state.q"
      type="search"
      placeholder="搜索游戏名、简介、作者或标签…"
      class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-neutral-600"
      @input="update({ q: ($event.target as HTMLInputElement).value })"
    />

    <div class="flex flex-wrap gap-1.5">
      <button
        class="rounded-full px-3 py-1 text-xs"
        :class="state.type === 'all' ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="update({ type: 'all' })"
      >全部类型</button>
      <button
        v-for="type in GAME_TYPES"
        :key="type"
        class="rounded-full px-3 py-1 text-xs"
        :class="state.type === type ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="update({ type: type as GameType })"
      >{{ GAME_TYPE_LABELS[type] }}</button>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="option in durationOptions"
        :key="option.value"
        class="rounded-full px-3 py-1 text-xs"
        :class="state.dur === option.value ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="update({ dur: option.value })"
      >{{ option.label }}</button>
    </div>

    <div v-if="tagCounts.length" class="flex flex-wrap gap-1.5">
      <button
        v-for="[tag, count] in tagCounts"
        :key="tag"
        class="rounded-full px-2.5 py-1 text-xs"
        :class="state.tags.includes(tag) ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="toggleTag(tag)"
      >{{ tag }} <span class="opacity-60">{{ count }}</span></button>
    </div>

    <div class="flex items-center gap-2 text-xs text-neutral-400">
      <span>排序</span>
      <select
        :value="state.sort"
        class="rounded border border-neutral-800 bg-neutral-900 px-2 py-1"
        @change="update({ sort: ($event.target as HTMLSelectElement).value as SortKey })"
      >
        <option value="new">最新收录</option>
        <option value="name">名称</option>
        <option value="duration">时长（短到长）</option>
      </select>
    </div>
  </div>
</template>
