<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GameSummary } from '@/data/types'
import { coverGradient, coverInitial } from '@/lib/cover'

const props = defineProps<{ game: GameSummary }>()
const failed = ref(false)

watch(() => props.game.cover, () => { failed.value = false })

const gradient = computed(() => {
  const [from, to] = coverGradient(props.game.id)
  return `linear-gradient(135deg, ${from}, ${to})`
})
const initial = computed(() => coverInitial(props.game.name))
</script>

<template>
  <div class="aspect-[16/9] w-full overflow-hidden">
    <img
      v-if="game.cover && !failed"
      :src="game.cover"
      :alt="game.name"
      loading="lazy"
      class="h-full w-full object-cover"
      @error="failed = true"
    />
    <div
      v-else
      class="h-full w-full flex items-center justify-center text-4xl font-bold text-white/90 select-none"
      :style="{ background: gradient }"
    >
      {{ initial }}
    </div>
  </div>
</template>
