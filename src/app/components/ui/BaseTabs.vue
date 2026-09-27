<script setup lang="ts">
// 页签按钮组：tone=accent 为主导航页签（黑底反白），tone=highlight 为过滤页签（高亮黄）。
withDefaults(
  defineProps<{
    modelValue: string
    items: { value: string; label: string }[]
    tone?: 'accent' | 'highlight'
    size?: 'md' | 'sm'
  }>(),
  { tone: 'accent', size: 'md' }
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div :class="['flex gap-2', size === 'md' ? 'text-sm font-bold' : 'text-xs font-bold']">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :class="[
        'border-2 border-ink',
        size === 'md' ? 'px-3 py-1.5' : 'px-2 py-1',
        modelValue === item.value
          ? (tone === 'accent' ? 'bg-accent-ink text-paper' : 'bg-highlight')
          : 'bg-surface'
      ]"
      @click="emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
