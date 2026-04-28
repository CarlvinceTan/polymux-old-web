<script setup lang="ts">
import { useI18n } from '#imports'

const { t } = useI18n()

const headerTabs = {
  Passwords: '/vault/passwords',
  Wallet: '/vault/wallet',
} as const satisfies Record<string, string>

const {
  passwords,
  loading,
  fetchPasswords,
  addPassword,
  deletePassword,
} = usePasswords()

const searchQuery = ref('')
const filterBy = ref('all')
const sortBy = ref('nameAZ')
const isAddModalOpen = ref(false)

const isFilterOpen = ref(false)
const isSortOpen = ref(false)
const filterRef = ref<HTMLElement | null>(null)
const sortRef = ref<HTMLElement | null>(null)

// view/edit modal state
const viewModalOpen = ref(false)
const editModalOpen = ref(false)
const activePasswordId = ref('')
const activePassword = computed(() => passwords.value.find(p => p.id === activePasswordId.value) ?? null)

const filterOptions = computed(() => [
  { value: 'all', label: t('vault.passwords.all') },
  { value: 'mostUsed', label: t('vault.passwords.mostUsed') },
  { value: 'recentlyUsed', label: t('vault.passwords.recentlyUsed') },
  { value: 'weak', label: t('vault.passwords.weakPasswords') },
])

const sortOptions = computed(() => [
  { value: 'nameAZ', label: t('vault.passwords.nameAZ') },
  { value: 'nameZA', label: t('vault.passwords.nameZA') },
  { value: 'lastUsed', label: t('vault.passwords.lastUsed') },
  { value: 'oldestFirst', label: t('vault.passwords.oldestFirst') },
])

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

const filteredPasswords = computed(() => {
  let result = [...passwords.value]

  if (searchQuery.value.trim()) {
    const term = searchQuery.value
    result = result.filter(
      p => fuzzyMatch(p.name, term) || fuzzyMatch(p.url, term) || fuzzyMatch(p.username, term),
    )
  }

  switch (filterBy.value) {
    case 'mostUsed':
      result = result.filter(p => p.usageCount >= 50)
      break
    case 'recentlyUsed':
      result = result.filter(p => {
        const d = new Date(p.lastUsed)
        const now = new Date()
        const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
        return diff <= 30
      })
      break
    case 'weak':
      result = result.filter(p => p.weak)
      break
  }

  switch (sortBy.value) {
    case 'nameAZ':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'nameZA':
      result.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'lastUsed':
      result.sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      break
    case 'oldestFirst':
      result.sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime())
      break
  }

  return result
})

async function handleAdd(entry: { name: string; url: string; username: string; password: string }) {
  await addPassword(entry.url, entry.username, entry.password, entry.name)
}

function handleView(id: string) {
  activePasswordId.value = id
  viewModalOpen.value = true
}

function handleEdit(id: string) {
  activePasswordId.value = id
  editModalOpen.value = true
}

async function handleDelete(id: string) {
  await deletePassword(id)
}

function handleFilterClickOutside(event: MouseEvent) {
  if (filterRef.value && !filterRef.value.contains(event.target as Node)) {
    isFilterOpen.value = false
  }
  if (sortRef.value && !sortRef.value.contains(event.target as Node)) {
    isSortOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleFilterClickOutside)
  fetchPasswords()
})

useOnReconnect(fetchPasswords)

onUnmounted(() => {
  document.removeEventListener('click', handleFilterClickOutside)
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>

    <TabPanel class="min-h-0 min-w-0 flex-1">
      <template #header>
        <div class="flex items-center gap-2">
          <div class="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-neutral-200 bg-neutral-50/50 transition focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-950/10">
            <div class="flex size-8 shrink-0 items-center justify-center text-neutral-400">
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            </div>
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('vault.passwords.searchPlaceholder')"
              class="min-w-0 flex-1 bg-transparent pr-2 text-body-md text-neutral-950 outline-none placeholder:text-neutral-400"
            >
          </div>

          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white transition-opacity hover:opacity-90"
            :aria-label="t('vault.passwords.addPassword')"
            @click="isAddModalOpen = true"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <div ref="filterRef" class="relative">
            <button
              type="button"
              class="flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
              @click="isFilterOpen = !isFilterOpen"
            >
              {{ t('vault.passwords.filterBy') }}
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              v-if="isFilterOpen"
              class="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200"
            >
              <button
                v-for="opt in filterOptions"
                :key="opt.value"
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-left text-body-md transition-colors hover:bg-neutral-100"
                :class="opt.value === filterBy ? 'font-medium text-neutral-950' : 'text-neutral-600'"
                @click="filterBy = opt.value; isFilterOpen = false"
              >
                {{ opt.label }}
                <svg v-if="opt.value === filterBy" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          </div>

          <div ref="sortRef" class="relative">
            <button
              type="button"
              class="flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
              @click="isSortOpen = !isSortOpen"
            >
              {{ t('vault.passwords.sortBy') }}
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div
              v-if="isSortOpen"
              class="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200"
            >
              <button
                v-for="opt in sortOptions"
                :key="opt.value"
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-left text-body-md transition-colors hover:bg-neutral-100"
                :class="opt.value === sortBy ? 'font-medium text-neutral-950' : 'text-neutral-600'"
                @click="sortBy = opt.value; isSortOpen = false"
              >
                {{ opt.label }}
                <svg v-if="opt.value === sortBy" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </template>

      <div class="relative" style="padding: 2.5rem 6rem">
        <div v-if="loading" class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p class="text-body-md font-medium text-neutral-500">{{ t('vault.passwords.loading') }}</p>
        </div>

        <div
          v-else-if="filteredPasswords.length > 0"
          class="grid gap-4"
          style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))"
        >
          <PasswordCard
            v-for="pw in filteredPasswords"
            :key="pw.id"
            :id="pw.id"
            :name="pw.name"
            :url="pw.url"
            :username="pw.username"
            :last-used="pw.lastUsed"
            @view="handleView"
            @edit="handleEdit"
            @delete="handleDelete"
          />
        </div>

        <div v-else-if="passwords.length === 0" class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <svg class="mb-4 size-10 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="7.5" cy="15.5" r="5.5" />
            <path d="m21 2-9.6 9.6" />
            <path d="m15.5 7.5 3 3L22 7l-3-3" />
          </svg>
          <p class="text-body-md font-medium text-neutral-500">{{ t('vault.passwords.empty') }}</p>
        </div>

        <p v-else class="py-12 text-center text-body-md text-neutral-500">
          {{ t('vault.passwords.noResults') }}
        </p>
      </div>
    </TabPanel>

    <AddPasswordModal
      :open="isAddModalOpen"
      @update:open="isAddModalOpen = $event"
      @add="handleAdd"
    />

    <ViewPasswordModal
      v-if="activePassword"
      :open="viewModalOpen"
      :password-id="activePassword.id"
      :name="activePassword.name"
      :url="activePassword.url"
      :username="activePassword.username"
      @update:open="viewModalOpen = $event"
    />

    <EditPasswordModal
      v-if="activePassword"
      :open="editModalOpen"
      :password-id="activePassword.id"
      :initial-name="activePassword.name"
      :initial-url="activePassword.url"
      :initial-username="activePassword.username"
      @update:open="editModalOpen = $event"
      @saved="editModalOpen = false"
    />
  </div>
</template>
