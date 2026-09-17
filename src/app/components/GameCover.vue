<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GameSummary } from '@/data/types'
import { coverColor, coverInitial } from '@/lib/cover'

const props = withDefaults(defineProps<{ game: GameSummary; ratio?: 'video' | 'hero' }>(), {
  ratio: 'video'
})
const failed = ref(false)

watch(() => props.game.cover, () => { failed.value = false })

const color = computed(() => coverColor(props.game.id))
const initial = computed(() => coverInitial(props.game.name))
const ratioClass = computed(() => (props.ratio === 'hero' ? 'aspect-[16/7]' : 'aspect-video'))
const initialClass = computed(() => (props.ratio === 'hero' ? 'text-6xl' : 'text-4xl'))
</script>

<template>
  <div class="w-full overflow-hidden" :class="ratioClass">
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
      class="flex h-full w-full select-none items-center justify-center font-display font-black text-white"
      :class="initialClass"
      :style="{ background: color }"
    >
      {{ initial }}
    </div>
  </div>
</template>
