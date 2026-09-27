<script setup lang="ts">
// 复选框 + 行内标签：label 包裹，插槽内容渲染在勾选框右侧。
// data-testid 等透传属性落在 input 上（保持既有 e2e 选择器可用）。
defineOptions({ inheritAttrs: false })
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="flex items-start gap-2 text-sm">
    <input
      v-bind="$attrs"
      type="checkbox"
      class="mt-1"
      :checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span><slot /></span>
  </label>
</template>
