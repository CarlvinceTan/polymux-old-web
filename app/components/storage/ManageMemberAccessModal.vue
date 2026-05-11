<script setup lang="ts">
import type { SelectedItem } from '~/types/storage'
import type { WorkspaceMember } from '~/composables/account/useWorkspaces'

const props = defineProps<{
  items: SelectedItem[]
  workspaceId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const { members, fetchMembers } = useWorkspaces()
const user = useSupabaseUser()

type GrantLevel = 'read' | 'write' | 'none'

interface GrantRow {
  user_id: string | null
  grant_level: GrantLevel
}

const grants = ref<GrantRow[]>([])
// keyed by user_id (or '' for all-members) → current ui-level selection.
// `'inherit'` means "no row" (remove if present).
const draft = ref<Map<string, GrantLevel | 'inherit'>>(new Map())
const effectiveByUser = ref<Map<string, GrantLevel>>(new Map())

const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref<string | null>(null)

const allMembersKey = ''

const isMulti = computed(() => props.items.length > 1)
const primaryItem = computed(() => props.items[0] ?? null)
const paths = computed(() => props.items.map(i => i.path))

function grantKey(row: GrantRow) {
  return row.user_id ?? allMembersKey
}

const allMembersDraft = computed<GrantLevel | 'inherit'>(() => draft.value.get(allMembersKey) ?? 'inherit')

const otherMembers = computed<WorkspaceMember[]>(() =>
  members.value.filter(m => m.user_id !== user.value?.id),
)

function levelLabel(level: GrantLevel | 'inherit'): string {
  if (level === 'inherit') return t('permissions.inherited')
  if (level === 'read') return t('permissions.read')
  if (level === 'write') return t('permissions.write')
  return t('permissions.hidden')
}

async function loadState() {
  isLoading.value = true
  errorMessage.value = null
  try {
    await fetchMembers(props.workspaceId)
    if (isMulti.value) {
      // Multi-target apply: don't preload existing grants because they may
      // differ per path. The draft starts empty (everything 'inherit') and
      // the user explicitly picks the levels to enforce across all paths.
      grants.value = []
      draft.value = new Map()
      effectiveByUser.value = new Map()
    }
    else {
      const path = primaryItem.value?.path ?? ''
      const rows = await $fetch<GrantRow[]>(`/api/workspaces/${props.workspaceId}/files/permissions`, {
        query: { path },
      })
      grants.value = rows
      draft.value = new Map()
      for (const row of rows) {
        draft.value.set(grantKey(row), row.grant_level)
      }
      const updates = await Promise.all(otherMembers.value.map(async (m) => {
        const { effective } = await $fetch<{ effective: GrantLevel }>(
          `/api/workspaces/${props.workspaceId}/files/permissions/preview`,
          { method: 'POST', body: { path, user_id: m.user_id } },
        )
        return [m.user_id, effective] as const
      }))
      effectiveByUser.value = new Map(updates)
    }
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('permissions.loadError')
  }
  finally {
    isLoading.value = false
  }
}

function setDraft(key: string, level: GrantLevel | 'inherit') {
  if (level === 'inherit') {
    draft.value.delete(key)
  }
  else {
    draft.value.set(key, level)
  }
  // Force reactivity.
  draft.value = new Map(draft.value)
}

function memberDisplayName(m: WorkspaceMember) {
  return m.display_name || m.email?.split('@')[0] || `${m.user_id.substring(0, 8)}…`
}

function computedEffective(userId: string): GrantLevel {
  const override = draft.value.get(userId)
  if (override && override !== 'inherit') return override
  const allMembers = allMembersDraft.value
  if (allMembers !== 'inherit') return allMembers
  return effectiveByUser.value.get(userId) ?? 'read'
}

const dirty = computed(() => {
  if (isMulti.value) return draft.value.size > 0
  if (draft.value.size !== grants.value.length) return true
  for (const row of grants.value) {
    if (draft.value.get(grantKey(row)) !== row.grant_level) return true
  }
  return false
})

async function save() {
  isSaving.value = true
  errorMessage.value = null

  try {
    const existingKeys = new Set(grants.value.map(grantKey))
    const targetKeys = new Set(draft.value.keys())

    const remove: (string | null)[] = []
    for (const key of existingKeys) {
      if (!targetKeys.has(key)) {
        remove.push(key === allMembersKey ? null : key)
      }
    }

    const grantsBody: { user_id: string | null; grant_level: GrantLevel }[] = []
    for (const [key, level] of draft.value.entries()) {
      // setDraft removes the key when level === 'inherit', so anything left
      // in draft is a concrete grant level.
      if (level === 'inherit') continue
      const existing = grants.value.find(r => grantKey(r) === key)
      if (existing && existing.grant_level === level) continue
      grantsBody.push({ user_id: key === allMembersKey ? null : key, grant_level: level })
    }

    await $fetch(`/api/workspaces/${props.workspaceId}/files/permissions/apply`, {
      method: 'POST',
      body: { paths: paths.value, grants: grantsBody, remove, cascade: true },
    })

    emit('close')
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('permissions.saveError')
  }
  finally {
    isSaving.value = false
  }
}

const titleSuffix = computed(() => {
  if (isMulti.value) return t('permissions.multiTitleSuffix', { n: props.items.length })
  return `"${primaryItem.value?.name ?? ''}"`
})

const subtitle = computed(() => {
  if (isMulti.value) return t('permissions.multiSubtitle', { n: props.items.length })
  return primaryItem.value?.path || t('permissions.rootPath')
})

onMounted(loadState)
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      data-modal
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
        appear
      >
        <div class="w-full max-w-xl mx-4 rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200 overflow-hidden">
          <!-- Title -->
          <div class="relative px-5 pt-5 pb-4">
            <button
              class="absolute right-4 top-4 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
              @click="emit('close')"
            >
              <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
            <h3 class="text-sm font-semibold text-neutral-900 pr-8 truncate">
              {{ t('permissions.title') }} {{ titleSuffix }}
            </h3>
            <p class="mt-0.5 text-xs text-neutral-500 truncate">{{ subtitle }}</p>
          </div>

          <div class="px-5 pb-5 border-t border-neutral-100 space-y-5 pt-4">
            <div v-if="errorMessage" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p class="text-xs text-red-700">{{ errorMessage }}</p>
            </div>

            <div v-if="isMulti" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p class="text-xs text-amber-700">{{ t('permissions.multiCascadeWarning') }}</p>
            </div>
            <div v-else class="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2">
              <p class="text-xs text-neutral-600">{{ t('permissions.cascadeNotice') }}</p>
            </div>

            <div v-if="isLoading" class="py-6 text-center">
              <p class="text-sm text-neutral-400">{{ t('permissions.loading') }}</p>
            </div>

            <template v-else>
              <!-- All workspace members (default) -->
              <div>
                <p class="text-xs font-medium text-neutral-500 mb-2">{{ t('permissions.defaultSection') }}</p>
                <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-neutral-950">{{ t('permissions.allMembers') }}</p>
                    <p class="text-xs text-neutral-400">{{ t('permissions.allMembersDescription') }}</p>
                  </div>
                  <select
                    class="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    :value="allMembersDraft"
                    @change="(e) => setDraft(allMembersKey, (e.target as HTMLSelectElement).value as GrantLevel | 'inherit')"
                  >
                    <option value="inherit">{{ t('permissions.noOverride') }}</option>
                    <option value="read">{{ t('permissions.read') }}</option>
                    <option value="write">{{ t('permissions.write') }}</option>
                    <option value="none">{{ t('permissions.hidden') }}</option>
                  </select>
                </div>
              </div>

              <!-- Per-member overrides -->
              <div>
                <p class="text-xs font-medium text-neutral-500 mb-2">{{ t('permissions.overridesSection') }}</p>
                <div v-if="otherMembers.length === 0" class="py-4 text-center">
                  <p class="text-sm text-neutral-400">{{ t('permissions.noOtherMembers') }}</p>
                </div>
                <div v-else class="space-y-2 max-h-64 overflow-y-auto">
                  <div
                    v-for="m in otherMembers"
                    :key="m.user_id"
                    class="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200"
                  >
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-neutral-950 truncate">{{ memberDisplayName(m) }}</p>
                      <p class="text-xs text-neutral-400 truncate">
                        {{ m.email || m.user_id }}<template v-if="!isMulti"> · {{ t('permissions.currentlyLabel', { level: levelLabel(computedEffective(m.user_id)) }) }}</template>
                      </p>
                    </div>
                    <select
                      class="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                      :value="draft.get(m.user_id) ?? 'inherit'"
                      @change="(e) => setDraft(m.user_id, (e.target as HTMLSelectElement).value as GrantLevel | 'inherit')"
                    >
                      <option value="inherit">{{ t('permissions.inherit') }}</option>
                      <option value="read">{{ t('permissions.read') }}</option>
                      <option value="write">{{ t('permissions.write') }}</option>
                      <option value="none">{{ t('permissions.hidden') }}</option>
                    </select>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div class="border-t border-neutral-100 px-5 py-3.5 flex items-center justify-end gap-2">
            <button
              class="rounded-lg bg-white px-4 py-2 text-sm font-normal text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
              @click="emit('close')"
            >
              {{ t('permissions.cancel') }}
            </button>
            <button
              class="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              :class="dirty && !isSaving
                ? 'bg-neutral-950 text-white hover:bg-neutral-800'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'"
              :disabled="!dirty || isSaving"
              @click="save"
            >
              {{ isSaving ? t('permissions.saving') : t('permissions.save') }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
