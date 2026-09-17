<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { DocMeta } from '@/data/types'

withDefaults(defineProps<{ docs: DocMeta[]; activeSlug: string; variant?: 'list' | 'tabs' }>(), {
  variant: 'list'
})
</script>

<template>
  <nav v-if="variant === 'list'" aria-label="文档列表" class="flex flex-col gap-1">
    <RouterLink
      v-for="doc in docs"
      :key="doc.slug"
      :to="`/docs/${doc.slug}`"
      class="flex items-baseline gap-2 border-2 border-transparent px-2 py-1.5"
      :class="doc.slug === activeSlug ? 'border-ink bg-highlight font-bold' : 'hover:bg-surface'"
    >
      <span class="font-mono text-[0.625rem]">{{ String(doc.order).padStart(2, '0') }}</span>
      <span class="text-sm">{{ doc.title }}</span>
    </RouterLink>
  </nav>

  <nav v-else aria-label="文档列表" class="flex gap-2 overflow-x-auto pb-1">
    <RouterLink
      v-for="doc in docs"
      :key="doc.slug"
      :to="`/docs/${doc.slug}`"
      class="shrink-0 border-2 border-ink px-3 py-2 font-mono text-xs"
      :class="doc.slug === activeSlug ? 'bg-highlight font-bold' : 'bg-surface'"
    >{{ doc.title }}</RouterLink>
  </nav>
</template>
