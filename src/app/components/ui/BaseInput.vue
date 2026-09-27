<script setup lang="ts">
// 标准文本输入框（原 SubmitFormView 的 inputClass 样式），id/placeholder 等属性透传。
withDefaults(defineProps<{ modelValue?: string; type?: string; invalid?: boolean }>(), {
  type: 'text'
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :aria-invalid="invalid"
    class="w-full border-2 border-ink bg-surface px-3 py-2 disabled:opacity-60"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  >
</template>
