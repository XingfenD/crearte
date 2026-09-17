import { ref, watch, type Ref } from 'vue'

export function useAsync<T>(loader: () => Promise<T>, deps: Ref<unknown>[] = []) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<Error | null>(null)
  const loading = ref(true)
  let runId = 0

  async function reload(): Promise<void> {
    const id = ++runId
    loading.value = true
    error.value = null
    try {
      const result = await loader()
      if (id === runId) data.value = result
    } catch (e) {
      if (id === runId) error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      if (id === runId) loading.value = false
    }
  }

  watch(deps, reload, { immediate: true })
  return { data, error, loading, reload }
}
