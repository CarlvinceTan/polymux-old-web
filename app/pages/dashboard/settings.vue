<script setup lang="ts">
const BROWSER_AGENT_CAPS: Record<string, number> = { free: 2, pro: 8, max: 20, enterprise: 50 }

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()
const user = useSupabaseUser()

const {
  workspaces,
  currentWorkspace,
  members,
  fetchMembers,
  updateWorkspace,
  deleteWorkspace,
} = useWorkspaces()

const editName = ref('')
const isSaving = ref(false)

const myRole = computed(() => {
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageMembers = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const canDeleteWorkspace = computed(() => myRole.value === 'owner')
const isOnlyWorkspace = computed(() => workspaces.value.length <= 1)
const showDeleteConfirm = ref(false)
const slugCopied = ref(false)

async function copySlug() {
  if (!currentWorkspace.value?.slug) return
  await navigator.clipboard.writeText(currentWorkspace.value.slug)
  slugCopied.value = true
  setTimeout(() => { slugCopied.value = false }, 2000)
}

watch(currentWorkspace, (ws) => {
  if (ws) {
    editName.value = ws.name
    fetchMembers(ws.id)
  }
}, { immediate: true })

async function saveName() {
  if (!currentWorkspace.value || !editName.value.trim()) return
  isSaving.value = true
  try { await updateWorkspace(currentWorkspace.value.id, editName.value.trim()) }
  finally { isSaving.value = false }
}

async function handleDeleteWorkspace() {
  if (!currentWorkspace.value) return
  const result = await deleteWorkspace(currentWorkspace.value.id)
  if (!result.ok) {
    showDeleteConfirm.value = false
    return
  }
  showDeleteConfirm.value = false
  navigateTo('/dashboard/home')
}

const browserAgentCapValue = computed(() =>
  BROWSER_AGENT_CAPS[currentWorkspace.value?.plan ?? 'free'] ?? BROWSER_AGENT_CAPS.free,
)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader
      :tabs="headerTabs"
      :separator-before-path="dashboardNavSeparatorBeforePath"
      raw-tab-labels
    />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <GuestPlaceholder v-if="!user" />
        <div v-else class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:px-8 lg:pb-6 lg:pt-5">
          <div class="mb-6 flex flex-col gap-1 border-b border-neutral-100 pb-5">
            <h1 class="text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
              Settings
            </h1>
            <p class="text-body-md text-neutral-500">
              Workspace name, identifiers, and lifecycle
            </p>
          </div>

          <section class="min-w-0">
            <h2 class="mb-3 text-label-md font-semibold uppercase tracking-widest text-neutral-400">General</h2>
            <div class="divide-y divide-neutral-100">
              <div class="pb-5">
                <label for="ws-name" class="block text-label-md font-medium text-neutral-500">Workspace Name</label>
                <div class="mt-2 flex gap-2">
                  <input
                    id="ws-name"
                    v-model="editName"
                    type="text"
                    class="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-950/10"
                    :disabled="!canManageMembers"
                    @keyup.enter="saveName"
                  />
                  <button
                    v-if="canManageMembers"
                    type="button"
                    class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                    :disabled="isSaving || editName.trim() === currentWorkspace?.name"
                    @click="saveName"
                  >
                    Save
                  </button>
                </div>
              </div>
              <dl class="grid grid-cols-1 gap-6 py-5 sm:grid-cols-3 sm:gap-8">
                <div>
                  <dt class="text-label-md font-medium text-neutral-400">Slug</dt>
                  <dd class="mt-1">
                    <button
                      type="button"
                      class="group inline-flex max-w-full items-center gap-1.5 rounded-md text-left text-body-md font-mono text-neutral-800 transition-colors hover:text-neutral-950"
                      @click="copySlug"
                    >
                      <span class="truncate">{{ currentWorkspace?.slug }}</span>
                      <svg v-if="!slugCopied" class="size-3.5 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      <svg v-else class="size-3.5 shrink-0 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                  </dd>
                </div>
                <div>
                  <dt class="text-label-md font-medium text-neutral-400">Plan</dt>
                  <dd class="mt-1 text-body-md capitalize text-neutral-800">{{ currentWorkspace?.plan || 'free' }}</dd>
                </div>
                <div>
                  <dt class="text-label-md font-medium text-neutral-400">Browser Agents</dt>
                  <dd class="mt-1 text-body-md tabular-nums text-neutral-800">{{ browserAgentCapValue }} max</dd>
                </div>
              </dl>
            </div>
          </section>

          <section v-if="canDeleteWorkspace" class="mt-10 min-w-0 border-t border-neutral-100 pt-8">
            <h2 class="mb-2 text-label-md font-semibold uppercase tracking-widest text-red-600/90">Danger Zone</h2>
            <template v-if="isOnlyWorkspace">
              <div class="flex items-start gap-2.5 text-amber-900">
                <svg class="mt-0.5 size-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <p class="text-body-md leading-relaxed">You must always have at least one workspace. Create another workspace before deleting this one.</p>
              </div>
            </template>
            <template v-else>
              <p class="max-w-xl text-body-md leading-relaxed text-neutral-500">Deleting this workspace will permanently remove all sessions and data within it.</p>
              <div class="mt-5">
                <button
                  v-if="!showDeleteConfirm"
                  type="button"
                  class="text-body-md font-medium text-red-700 underline decoration-red-300 underline-offset-4 transition-colors hover:text-red-800 hover:decoration-red-500"
                  @click="showDeleteConfirm = true"
                >
                  Delete workspace…
                </button>
                <div v-else class="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                  <span class="text-body-md text-red-700">Are you sure? This cannot be undone.</span>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="rounded-lg bg-red-600 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-red-700"
                      @click="handleDeleteWorkspace"
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      class="rounded-lg px-4 py-2 text-body-md font-normal text-neutral-700 transition-colors hover:bg-neutral-100"
                      @click="showDeleteConfirm = false"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </section>

          <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
        </div>
      </TabPanel>
    </div>
  </div>
</template>