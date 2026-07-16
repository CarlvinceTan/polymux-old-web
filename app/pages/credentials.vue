<script setup lang="ts">
import { useI18n } from '#imports'
import { useIntersectionObserver } from '@vueuse/core'
import { useInfiniteList } from '~/composables/misc/useInfiniteList'
import type { CredentialEntry, CredentialKind } from '~/composables/vault/useCredentials'
import type { AgentAccessPolicy } from '~/composables/vault/usePasswords'

const { t } = useI18n()
const { show } = useAppToast()

const {
  credentials,
  loading,
  canManageAccess,
  counts,
  fetchCredentials,
  addPassword,
  deletePassword,
  updateAgentAccess,
  forgetOrigin,
} = useCredentials()

// Resolve created_by / last_used_by UUIDs to display names. Members are fetched
// on mount alongside credentials; both states are workspace-scoped via useState.
const { currentWorkspace, members, fetchMembers } = useWorkspaces()

const memberLookup = computed(() => {
  const map = new Map<string, string>()
  for (const m of members.value) {
    map.set(m.user_id, m.display_name?.trim() || m.email || m.user_id.slice(0, 8))
  }
  return map
})

function nameFor(userId: string | null | undefined): string {
  if (!userId) return t('vault.passwords.unknownUser')
  return memberLookup.value.get(userId) ?? t('vault.passwords.unknownUser')
}

const searchQuery = ref('')
const sortBy = ref('lastUsed')
const isAddModalOpen = ref(false)

const isSortOpen = ref(false)
const sortRef = ref<HTMLElement | null>(null)

// Left-rail filters
const kindFilter = ref<'all' | CredentialKind>('all')
const accessFilter = ref<'all' | AgentAccessPolicy>('all')

const sortOptions = computed(() => [
  { value: 'nameAZ', label: t('vault.passwords.nameAZ') },
  { value: 'nameZA', label: t('vault.passwords.nameZA') },
  { value: 'lastUsed', label: t('vault.passwords.lastUsed') },
  { value: 'oldestFirst', label: t('vault.passwords.oldestFirst') },
])

// The sort button shows the active selection (e.g. "Last used"), not a static label.
const currentSortLabel = computed(
  () => sortOptions.value.find(o => o.value === sortBy.value)?.label ?? t('vault.passwords.sortBy'),
)

const allCounts = computed(() => counts())

const typeFilterOptions = computed(() => [
  { value: 'all' as const, label: t('vault.credentials.filters.allTypes'), count: allCounts.value.byKind.all },
  { value: 'login' as const, label: t('vault.credentials.filters.logins'), count: allCounts.value.byKind.login },
  { value: 'secret' as const, label: t('vault.credentials.filters.secrets'), count: allCounts.value.byKind.secret },
  { value: 'saved_signin' as const, label: t('vault.credentials.filters.savedSignIns'), count: allCounts.value.byKind.saved_signin },
])

const accessFilterOptions = computed(() => [
  { value: 'all' as const, label: t('vault.credentials.filters.allAccess'), count: allCounts.value.byAccess.all },
  { value: 'allowed' as const, label: t('vault.credentials.access.allowed'), count: allCounts.value.byAccess.allowed },
  { value: 'consent_required' as const, label: t('vault.credentials.access.consentRequired'), count: allCounts.value.byAccess.consent_required },
  { value: 'blocked' as const, label: t('vault.credentials.access.blocked'), count: allCounts.value.byAccess.blocked },
])

const hasActiveFilters = computed(() => kindFilter.value !== 'all' || accessFilter.value !== 'all')

function clearFilters() {
  kindFilter.value = 'all'
  accessFilter.value = 'all'
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query.trim()) return true
  const lo = text.toLowerCase()
  const q = query.toLowerCase().trim()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lo.indexOf(q[qi]!, ti)
    if (idx === -1) return false
    ti = idx + 1
  }
  return true
}

const filteredCredentials = computed<CredentialEntry[]>(() => {
  let result = [...credentials.value]

  if (kindFilter.value !== 'all') {
    result = result.filter(c => c.kind === kindFilter.value)
  }
  if (accessFilter.value !== 'all') {
    result = result.filter(c => c.agentAccess === accessFilter.value)
  }
  if (searchQuery.value.trim()) {
    const term = searchQuery.value
    result = result.filter(
      c => fuzzyMatch(c.name, term) || fuzzyMatch(c.url ?? '', term) || fuzzyMatch(c.username ?? '', term),
    )
  }

  switch (sortBy.value) {
    case 'nameAZ':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'nameZA':
      result.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'lastUsed':
      result.sort((a, b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime())
      break
    case 'oldestFirst':
      result.sort((a, b) => new Date(a.lastUsedAt ?? 0).getTime() - new Date(b.lastUsedAt ?? 0).getTime())
      break
  }

  return result
})

const { visibleItems: visibleCredentials, hasMore, loadMore } = useInfiniteList(filteredCredentials, 40)

// The rows area is its own scroll container (toolbar + headings stay pinned
// above it), so the infinite-scroll sentinel observes that element as root.
const rowsScrollEl = ref<HTMLElement | null>(null)
const scrollSentinel = ref<HTMLElement | null>(null)

useIntersectionObserver(
  scrollSentinel,
  ([e]) => {
    if (e?.isIntersecting && hasMore.value) loadMore()
  },
  { root: rowsScrollEl, rootMargin: '160px' },
)

const isEmpty = computed(() => credentials.value.length === 0 && !loading.value)
const noResults = computed(() => credentials.value.length > 0 && filteredCredentials.value.length === 0)

async function handleAdd(entry: { name: string; url: string; username: string; password: string; type: 'login' | 'secret' }) {
  // New credentials default agent_access='consent_required' (set in addPassword).
  await addPassword(entry.url, entry.username, entry.password, entry.name, { type: entry.type })
}

async function handleForget(c: CredentialEntry) {
  if (c.kind === 'saved_signin') {
    await forgetOrigin(c.id)
  }
  else {
    await deletePassword(c.id)
  }
}

async function handleAgentAccess(c: CredentialEntry, policy: AgentAccessPolicy) {
  if (!canManageAccess.value) return
  const ok = await updateAgentAccess(c.id, policy)
  if (!ok) show(t('vault.credentials.access.updateFailed'), 'error')
}

function handleSortClickOutside(event: MouseEvent) {
  if (sortRef.value && !sortRef.value.contains(event.target as Node)) {
    isSortOpen.value = false
  }
}

async function loadAll(wsId: string, opts?: { force?: boolean }) {
  await fetchCredentials(opts)
  void fetchMembers(wsId)
}

onMounted(() => {
  document.addEventListener('click', handleSortClickOutside)
  if (currentWorkspace.value?.id) loadAll(currentWorkspace.value.id)
})

useOnReconnect(() => {
  if (currentWorkspace.value?.id) loadAll(currentWorkspace.value.id, { force: true })
})

onUnmounted(() => {
  document.removeEventListener('click', handleSortClickOutside)
})
</script>

<template>
  <FeatureGate name="vault">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
      <TabPanel class="-mx-4 -mb-4 min-h-0 min-w-0 flex-1">
        <!-- TabPanel forces flex-col onto its single body child, so the
             horizontal (filter rail | content) split lives one level deeper. -->
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <!-- Full-width toolbar row: the blank rail spacer keeps controls aligned
               while the divider below can span the whole card edge-to-edge. -->
          <div class="flex shrink-0">
            <div class="hidden w-52 shrink-0 lg:block" aria-hidden="true" />
            <div class="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 lg:border-l lg:border-neutral-200/70">
              <div class="flex h-[34px] min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50/60 px-2.5 transition focus-within:border-neutral-400 focus-within:bg-white">
                <svg class="size-[15px] shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input
                  v-model="searchQuery"
                  data-testid="vault-credential-search"
                  name="vault-credentials-search"
                  type="text"
                  :placeholder="t('vault.credentials.searchPlaceholder')"
                  class="min-w-0 flex-1 bg-transparent text-nav text-neutral-950 outline-none placeholder:text-neutral-400"
                >
              </div>

              <button
                type="button"
                data-testid="vault-add-credential-button"
                class="flex h-[28px] shrink-0 items-center gap-1 rounded-lg bg-neutral-950 pl-2 pr-2.5 text-nav font-medium text-white transition-opacity hover:opacity-90"
                @click="isAddModalOpen = true"
              >
                <svg class="size-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                {{ t('vault.credentials.addShort') }}
              </button>

              <div ref="sortRef" class="relative shrink-0">
                <button
                  type="button"
                  class="flex h-[28px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-nav text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
                  @click="isSortOpen = !isSortOpen"
                >
                  <svg class="size-[15px] shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h12M3 12h9M3 18h5M17 8v12M17 20l3-3M17 20l-3-3" /></svg>
                  {{ currentSortLabel }}
                  <svg class="size-[15px] shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <div
                  v-if="isSortOpen"
                  class="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-neutral-200"
                >
                  <button
                    v-for="opt in sortOptions"
                    :key="opt.value"
                    type="button"
                    class="flex w-full items-center justify-between px-3 py-2 text-left text-nav transition-colors hover:bg-neutral-100"
                    :class="opt.value === sortBy ? 'font-medium text-neutral-950' : 'text-neutral-600'"
                    @click="sortBy = opt.value; isSortOpen = false"
                  >
                    {{ opt.label }}
                    <svg v-if="opt.value === sortBy" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="h-px w-full shrink-0 bg-neutral-200/90" aria-hidden="true" />

          <div class="flex min-h-0 min-w-0 flex-1">
            <!-- Left filter rail -->
            <aside class="hidden w-52 shrink-0 flex-col gap-6 overflow-y-auto px-3 py-4 lg:flex">
              <div>
                <p class="mb-2 px-2 text-meta font-semibold uppercase tracking-wide text-neutral-400">{{ t('vault.credentials.filters.type') }}</p>
                <div class="flex flex-col gap-0.5">
                  <button
                    v-for="opt in typeFilterOptions"
                    :key="opt.value"
                    type="button"
                    class="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-body-md transition-colors"
                    :class="kindFilter === opt.value ? 'bg-neutral-100 font-medium text-neutral-950' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950'"
                    @click="kindFilter = opt.value"
                  >
                    <span class="truncate">{{ opt.label }}</span>
                    <span class="shrink-0 tabular-nums text-meta text-neutral-400">{{ opt.count }}</span>
                  </button>
                </div>
              </div>

              <div>
                <p class="mb-2 px-2 text-meta font-semibold uppercase tracking-wide text-neutral-400">{{ t('vault.credentials.filters.agentAccess') }}</p>
                <div class="flex flex-col gap-0.5">
                  <button
                    v-for="opt in accessFilterOptions"
                    :key="opt.value"
                    type="button"
                    class="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-body-md transition-colors"
                    :class="accessFilter === opt.value ? 'bg-neutral-100 font-medium text-neutral-950' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950'"
                    @click="accessFilter = opt.value"
                  >
                    <span class="truncate">{{ opt.label }}</span>
                    <span class="shrink-0 tabular-nums text-meta text-neutral-400">{{ opt.count }}</span>
                  </button>
                </div>
              </div>

              <button
                v-if="hasActiveFilters"
                type="button"
                class="px-2.5 text-left text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
                @click="clearFilters"
              >
                {{ t('vault.credentials.filters.clear') }}
              </button>
            </aside>

            <!-- Right column: headings · divider · scrollable rows.
                 A thin vertical line (lg:border-l) separates it from the filter rail. -->
            <div class="flex min-h-0 min-w-0 flex-1 flex-col lg:border-l lg:border-neutral-200/70">
              <!-- Empty state -->
              <div v-if="isEmpty" class="flex flex-1 flex-col items-center justify-center px-4 text-center">
                <div class="flex max-w-sm flex-col items-center gap-3">
                  <svg class="size-10 shrink-0 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <p class="text-body-md font-medium text-neutral-500">{{ t('vault.credentials.empty') }}</p>
                  <button
                    type="button"
                    class="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                    @click="isAddModalOpen = true"
                  >
                    {{ t('vault.credentials.addCta') }}
                  </button>
                </div>
              </div>

              <!-- No results after filter -->
              <div v-else-if="noResults" class="flex flex-1 flex-col items-center justify-center px-4 text-center">
                <p class="text-body-md text-neutral-500">{{ t('vault.credentials.noResults') }}</p>
                <button
                  v-if="hasActiveFilters"
                  type="button"
                  class="mt-3 text-label-md font-medium text-neutral-500 transition-colors hover:text-neutral-950"
                  @click="clearFilters"
                >
                  {{ t('vault.credentials.filters.clear') }}
                </button>
              </div>

              <!-- Column headings · divider · scrollable rows -->
              <template v-else>
                <div class="grid shrink-0 grid-cols-[minmax(0,2.2fr)_minmax(0,2.8fr)_112px_minmax(0,1.4fr)_48px] items-center gap-3 px-3 py-2 text-meta font-medium uppercase tracking-wide text-neutral-400">
                  <span>{{ t('vault.credentials.col.name') }}</span>
                  <span>{{ t('vault.credentials.col.username') }}</span>
                  <span>{{ t('vault.credentials.col.agentAccess') }}</span>
                  <span>{{ t('vault.credentials.col.lastUsed') }}</span>
                  <span class="sr-only">{{ t('vault.credentials.col.actions') }}</span>
                </div>

                <div class="h-px w-full shrink-0 bg-neutral-200/90" aria-hidden="true" />

                <div
                  ref="rowsScrollEl"
                  data-testid="vault-credential-table"
                  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
                >
                  <CredentialRow
                    v-for="c in visibleCredentials"
                    :key="`${c.kind}-${c.id}`"
                    :credential="c"
                    :can-manage-access="canManageAccess"
                    :last-used-by-name="c.lastUsedBy ? nameFor(c.lastUsedBy) : null"
                    @forget="handleForget"
                    @update:agent-access="handleAgentAccess"
                  />
                  <div
                    v-if="hasMore"
                    ref="scrollSentinel"
                    class="h-px w-full shrink-0"
                    aria-hidden="true"
                  />
                </div>
              </template>
            </div>
          </div>
        </div>
      </TabPanel>

      <AddPasswordModal
        :open="isAddModalOpen"
        @update:open="isAddModalOpen = $event"
        @add="handleAdd"
      />
    </div>
  </FeatureGate>
</template>
