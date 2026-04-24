<script setup lang="ts">
import type { WorkspaceMember } from '~/composables/useWorkspaces'

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()
const user = useSupabaseUser()

const {
  currentWorkspace,
  members,
  fetchMembers,
  addMember,
  updateMemberRole,
  removeMember,
} = useWorkspaces()

const myRole = computed(() => {
  if (currentWorkspace.value?.role) return currentWorkspace.value.role
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageMembers = computed(() => myRole.value === 'owner' || myRole.value === 'admin')

watch(currentWorkspace, (ws) => {
  if (ws) fetchMembers(ws.id)
}, { immediate: true })

const memberSearch = ref('')
const filteredMembers = computed(() => {
  const q = memberSearch.value.toLowerCase().trim()
  if (!q) return members.value
  return members.value.filter(m =>
    (m.email?.toLowerCase().includes(q))
    || (m.display_name?.toLowerCase().includes(q))
    || m.user_id.toLowerCase().includes(q),
  )
})

const activeMemberMenuId = ref<string | null>(null)
const memberMenuPos = ref({ top: 0, left: 0 })

function toggleMemberMenu(userId: string, event: MouseEvent) {
  if (activeMemberMenuId.value === userId) {
    activeMemberMenuId.value = null
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  memberMenuPos.value = { top: rect.bottom + 4, left: rect.right - 176 }
  activeMemberMenuId.value = userId
}
function closeMemberMenus() { activeMemberMenuId.value = null }

function memberDisplayName(m: WorkspaceMember) {
  return m.display_name || m.email?.split('@')[0] || m.user_id.substring(0, 8) + '...'
}

function memberEmail(m: WorkspaceMember) {
  return m.email || '—'
}

function memberInitials(m: WorkspaceMember) {
  const name = m.display_name || m.email || m.user_id
  return name.split(/\s+/).map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
}

const isInviteOpen = ref(false)
const inviteEmails = ref('')
const inviteRole = ref<'admin' | 'member'>('member')
const isInviting = ref(false)

function openInviteModal() {
  inviteEmails.value = ''
  inviteRole.value = 'member'
  isInviteOpen.value = true
}

async function handleSendInvitations() {
  if (!currentWorkspace.value || !inviteEmails.value.trim()) return
  isInviting.value = true
  try {
    const emails = inviteEmails.value.split(',').map(e => e.trim()).filter(Boolean)
    for (const email of emails) {
      await addMember(currentWorkspace.value.id, email, inviteRole.value)
    }
    isInviteOpen.value = false
  }
  finally { isInviting.value = false }
}

const managingMember = ref<WorkspaceMember | null>(null)
const isManageAccessOpen = ref(false)
const manageAccessRole = ref<string>('member')

function openManageAccess(member: WorkspaceMember) {
  managingMember.value = member
  manageAccessRole.value = member.role
  isManageAccessOpen.value = true
  closeMemberMenus()
}

async function saveManageAccess() {
  if (!currentWorkspace.value || !managingMember.value) return
  await updateMemberRole(currentWorkspace.value.id, managingMember.value.user_id, manageAccessRole.value)
  isManageAccessOpen.value = false
}

async function handleRemoveMember(member: WorkspaceMember) {
  if (!currentWorkspace.value) return
  closeMemberMenus()
  await removeMember(currentWorkspace.value.id, member.user_id)
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

const roleBadgeClass: Record<string, string> = {
  owner: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60',
  admin: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60',
  member: 'bg-neutral-100 text-neutral-600',
}

const roles = ['owner', 'admin', 'member'] as const

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as Node
  const menu = document.querySelector('.member-action-menu')
  const triggers = document.querySelectorAll('.member-action-trigger')
  let clickedTrigger = false
  triggers.forEach(el => { if (el.contains(target)) clickedTrigger = true })
  if (!clickedTrigger && (!menu || !menu.contains(target))) {
    closeMemberMenus()
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))
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
        <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:px-8 lg:pb-6 lg:pt-5">
          <div class="mb-3 flex items-start justify-between gap-4">
            <h1 class="min-w-0 text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
              Team
            </h1>
            <div class="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p class="text-right text-label-md text-neutral-400 tabular-nums">
                {{ filteredMembers.length }} {{ filteredMembers.length === 1 ? 'member' : 'members' }}
                <template v-if="memberSearch && filteredMembers.length !== members.length">
                  <span class="text-neutral-300"> · </span>{{ members.length }} total
                </template>
              </p>
              <button
                v-if="canManageMembers"
                type="button"
                class="flex w-fit items-center gap-1.5 rounded-lg bg-neutral-950 px-3 py-1.5 text-body-md font-medium text-white transition-colors hover:bg-neutral-800"
                @click="openInviteModal"
              >
                <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Invite
              </button>
            </div>
          </div>

          <div class="relative mb-3 shrink-0">
            <svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input
              v-model="memberSearch"
              type="text"
              placeholder="Search members..."
              class="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 py-2 pl-9 pr-3 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
            />
          </div>

          <div class="min-h-0 min-w-0 flex-1 divide-y divide-neutral-100">
            <div
              v-for="member in filteredMembers"
              :key="member.user_id"
              class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-3.5 lg:gap-5"
            >
              <AccountIcon :initials="memberInitials(member)" size="md" color="bg-neutral-800" />
              <div class="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-6 lg:gap-10">
                <p class="truncate text-sm font-semibold leading-tight text-neutral-950 md:w-36 md:shrink-0 lg:w-44 xl:w-52">
                  {{ memberDisplayName(member) }}
                </p>
                <p class="min-w-0 truncate text-label-md text-neutral-400 md:flex-1">
                  {{ memberEmail(member) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2 sm:gap-2.5">
                <span
                  class="rounded-full px-2 py-0.5 text-label-md font-medium"
                  :class="roleBadgeClass[member.role] || roleBadgeClass.member"
                >
                  {{ roleLabel(member.role) }}
                </span>
                <button
                  v-if="canManageMembers && member.user_id !== user?.id && member.role !== 'owner'"
                  type="button"
                  class="rounded-md px-2 py-1 text-label-md font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  @click="openManageAccess(member)"
                >
                  Manage
                </button>
                <button
                  type="button"
                  class="member-action-trigger rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                  @click.stop="toggleMemberMenu(member.user_id, $event)"
                >
                  <svg class="size-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                </button>
              </div>
            </div>

            <div v-if="filteredMembers.length === 0" class="py-10 text-center text-body-md text-neutral-400">
              {{ memberSearch ? 'No members match your search.' : 'No members found.' }}
            </div>
          </div>

          <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
        </div>
      </TabPanel>
    </div>
  </div>

  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="scale-95 opacity-0"
      enter-to-class="scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="scale-100 opacity-100"
      leave-to-class="scale-95 opacity-0"
    >
      <div
        v-if="activeMemberMenuId"
        class="member-action-menu fixed z-[9999] w-44 rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden"
        :style="{ top: memberMenuPos.top + 'px', left: memberMenuPos.left + 'px' }"
      >
        <template v-for="member in [members.find(m => m.user_id === activeMemberMenuId)]" :key="member?.user_id">
          <button
            v-if="canManageMembers && member && member.user_id !== user?.id && member.role !== 'owner'"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-red-600 transition-colors hover:bg-red-50"
            @click.stop="handleRemoveMember(member)"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
            Remove member
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-neutral-700 transition-colors hover:bg-neutral-50"
            @click.stop="closeMemberMenus"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" /></svg>
            Resend invitation
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-neutral-700 transition-colors hover:bg-neutral-50"
            @click.stop="closeMemberMenus"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
            Revoke invitation
          </button>
          <template v-if="member && member.user_id === user?.id && member.role !== 'owner'">
            <div class="my-0.5 h-px bg-neutral-200 mx-2" />
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-red-600 transition-colors hover:bg-red-50"
              @click.stop="handleRemoveMember(member)"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Leave workspace
            </button>
          </template>
        </template>
      </div>
    </Transition>
  </Teleport>

  <UModal v-model:open="isInviteOpen" title="Invite Members" description="Add people to your workspace by email.">
    <template #body>
      <div class="space-y-4">
        <div>
          <label for="invite-emails" class="block text-label-md font-medium text-neutral-600">Email addresses</label>
          <p class="mt-0.5 text-label-md text-neutral-400">Separate multiple emails with commas.</p>
          <textarea
            id="invite-emails"
            v-model="inviteEmails"
            rows="3"
            placeholder="alice@example.com, bob@example.com"
            class="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 resize-none placeholder:text-neutral-400"
          />
        </div>
        <div>
          <label for="invite-role" class="block text-label-md font-medium text-neutral-600">Role</label>
          <select
            id="invite-role"
            v-model="inviteRole"
            class="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
          >
            <option value="admin">Admin — Can manage members and settings</option>
            <option value="member">Member — Can create and edit sessions</option>
          </select>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 transition-colors hover:bg-neutral-50 ring-1 ring-neutral-200"
          @click="isInviteOpen = false"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="isInviting || !inviteEmails.trim()"
          @click="handleSendInvitations"
        >
          {{ isInviting ? 'Sending...' : 'Send Invitation' }}
        </button>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="isManageAccessOpen" title="Manage Access" :description="`Change role for ${managingMember ? memberDisplayName(managingMember) : 'member'}`">
    <template #body>
      <div v-if="managingMember" class="space-y-4">
        <div class="flex items-center gap-3">
          <AccountIcon :initials="memberInitials(managingMember)" size="lg" color="bg-neutral-800" />
          <div>
            <p class="text-body-md font-medium text-neutral-950">{{ memberDisplayName(managingMember) }}</p>
            <p class="text-label-md text-neutral-400">{{ memberEmail(managingMember) }}</p>
          </div>
        </div>
        <div>
          <label for="manage-role" class="block text-label-md font-medium text-neutral-600">Role</label>
          <select
            id="manage-role"
            v-model="manageAccessRole"
            class="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
          >
            <option v-for="r in roles" :key="r" :value="r" :disabled="r === 'owner' && myRole !== 'owner'">
              {{ roleLabel(r) }}
            </option>
          </select>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-white px-4 py-2 text-body-md font-normal text-neutral-950 transition-colors hover:bg-neutral-50 ring-1 ring-neutral-200"
          @click="isManageAccessOpen = false"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-neutral-950 px-4 py-2 text-body-md font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          :disabled="manageAccessRole === managingMember?.role"
          @click="saveManageAccess"
        >
          Save Changes
        </button>
      </div>
    </template>
  </UModal>
</template>