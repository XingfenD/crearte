<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { repo, type Doc, type DocMeta } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { extractToc, renderMarkdown } from '@/lib/markdown'
import DocSidebar from '@/components/DocSidebar.vue'
import DocToc from '@/components/DocToc.vue'
import StatePanel from '@/components/StatePanel.vue'

const props = defineProps<{ slug?: string }>()
const router = useRouter()

const { data: docs, error: listError, loading: listLoading } = useAsync<DocMeta[]>(() => repo.listDocs())
const { data: doc, error: docError, loading: docLoading, reload } = useAsync<Doc | null>(
  () => (props.slug ? repo.getDoc(props.slug) : Promise.resolve(null)),
  [computed(() => props.slug ?? '')]
)

watchEffect(() => {
  if (!props.slug && docs.value?.length) void router.replace(`/docs/${docs.value[0].slug}`)
})

const html = computed(() => (doc.value ? renderMarkdown(doc.value.content) : ''))
const toc = computed(() => (doc.value ? extractToc(doc.value.content) : []))
</script>

<template>
  <StatePanel :loading="listLoading || docLoading" :error="listError ?? docError" @retry="reload">
    <DocSidebar :docs="docs ?? []" :active-slug="slug ?? ''" variant="tabs" class="mb-6 sm:hidden" />

    <div class="flex flex-1 items-start gap-8">
      <aside class="relative hidden w-[200px] shrink-0 self-stretch sm:block">
        <div class="absolute inset-0">
          <div class="sticky top-20 h-[calc(100vh-9.75rem)] max-h-full overflow-y-auto border-r-[3px] border-ink bg-surface p-4">
            <DocSidebar :docs="docs ?? []" :active-slug="slug ?? ''" />
          </div>
        </div>
      </aside>
      <article class="min-w-0 flex-1 max-w-[640px]">
        <h1 class="mb-5 font-display text-[1.625rem] font-black">{{ doc?.title }}</h1>
        <div class="markdown-body" v-html="html" />
      </article>
      <DocToc :items="toc" class="hidden w-[170px] shrink-0 lg:block" />
    </div>
  </StatePanel>
</template>
