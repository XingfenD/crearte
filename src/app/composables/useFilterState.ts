import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parseFilterState, toQuery, type FilterState } from '@/lib/filter'

export function useFilterState() {
  const route = useRoute()
  const router = useRouter()
  const state = computed(() => parseFilterState(route.query))

  function update(patch: Partial<FilterState>): void {
    void router.replace({ query: toQuery({ ...state.value, ...patch }) })
  }

  return { state, update }
}
