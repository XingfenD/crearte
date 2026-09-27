<script setup lang="ts">
// 标准下拉列表：样式与 BaseInput 一致，但隐藏原生箭头、自绘站点 caret 图标
// （与目录页排序下拉同款纸墨风）。<option> 走默认插槽；
// data-testid / id / class 等透传属性落在 select 上（保持既有 e2e 选择器可用）。
import { PhCaretDown } from '@phosphor-icons/vue'

defineOptions({ inheritAttrs: false })
defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="relative">
    <select
      v-bind="$attrs"
      :value="modelValue"
      class="w-full appearance-none border-2 border-ink bg-surface py-2 pl-3 pr-8 disabled:opacity-60"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <slot />
    </select>
    <PhCaretDown
      :size="12"
      weight="bold"
      aria-hidden="true"
      class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
    />
  </div>
</template>
