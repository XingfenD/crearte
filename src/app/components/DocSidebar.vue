<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { DocMeta } from '@/data/types'

defineProps<{ docs: DocMeta[]; activeSlug: string }>()
</script>

<template>
  <nav class="space-y-1 text-sm">
    <RouterLink
      v-for="doc in docs"
      :key="doc.slug"
      :to="`/docs/${doc.slug}`"
      class="block rounded px-2 py-1.5"
      :class="doc.slug === activeSlug ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'"
    >{{ doc.title }}</RouterLink>
  </nav>
</template>
