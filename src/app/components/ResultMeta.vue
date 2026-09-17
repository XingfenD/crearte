<script setup lang="ts">
import { computed } from 'vue'
import { PhArrowsDownUp, PhCaretDown, PhFunnelSimple } from '@phosphor-icons/vue'
import type { SortKey } from '@/lib/filter'
import { useFilterState } from '@/composables/useFilterState'

withDefaults(defineProps<{ count: number; filtersOpen?: boolean }>(), { filtersOpen: false })
defineEmits<{ openFilters: [] }>()

const { state, update } = useFilterState()
const activeCount = computed(
  () => (state.value.type !== 'all' ? 1 : 0) + (state.value.dur !== 'all' ? 1 : 0) + state.value.tags.length
)
</script>

<template>
  <div class="flex items-center gap-3">
    <p class="shrink-0 text-[0.9375rem] font-extrabold" aria-live="polite">{{ count }} 款游戏</p>
    <div class="h-0 flex-1 border-t-2 border-ink" aria-hidden="true" />
    <PhArrowsDownUp :size="14" weight="bold" aria-hidden="true" class="hidden shrink-0 text-ink-soft sm:block" />
    <label for="catalog-sort" class="sr-only">排序</label>
    <div class="relative shrink-0">
      <select
        id="catalog-sort"
        :value="state.sort"
        class="w-full appearance-none border-2 border-ink bg-surface py-1.5 pl-2 pr-8 font-mono text-xs"
        @change="update({ sort: ($event.target as HTMLSelectElement).value as SortKey })"
      >
        <option value="new">最新收录</option>
        <option value="name">名称</option>
        <option value="duration">时长（短到长）</option>
      </select>
      <PhCaretDown
        :size="12"
        weight="bold"
        aria-hidden="true"
        class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
      />
    </div>
    <button
      type="button"
      class="lift flex shrink-0 items-center gap-1.5 border-2 border-ink bg-surface px-3 py-2 text-xs font-extrabold shadow-hard-sm hover:shadow-hard active:shadow-none lg:hidden"
      aria-haspopup="dialog"
      :aria-expanded="filtersOpen"
      @click="$emit('openFilters')"
    >
      <PhFunnelSimple :size="14" weight="bold" aria-hidden="true" />
      筛选
      <span
        v-if="activeCount"
        class="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center bg-accent px-1 font-mono text-[0.625rem] text-ink"
      >{{ activeCount }}</span>
    </button>
  </div>
</template>
