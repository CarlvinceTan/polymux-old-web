<script setup lang="ts">
import type { WorkspaceInvitation, WorkspaceMember } from '~/composables/useWorkspaces'

const { headerTabs, dashboardNavSeparatorBeforePath } = useDashboardNavTabs()
const user = useSupabaseUser()

const {
  currentWorkspace,
  members,
  invitations,
  fetchMembers,
  fetchInvitations,
  inviteMember,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
  removeMember,
} = useWorkspaces()

const myRole = computed(() => {
  if (currentWorkspace.value?.role) return currentWorkspace.value.role
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageMembers = computed(() => myRole.value === 'owner' || myRole.value === 'admin')

function loadTeamData() {
  const ws = currentWorkspace.value
  if (!ws) return
  fetchMembers(ws.id)
  if (myRole.value === 'owner' || myRole.value === 'admin') {
    fetchInvitations(ws.id)
  }
}

watch(currentWorkspace, loadTeamData, { immediate: true })

watch(myRole, (role) => {
  if ((role === 'owner' || role === 'admin') && currentWorkspace.value) {
    fetchInvitations(currentWorkspace.value.id)
  }
})

useOnReconnect(loadTeamData)

// `now` ticks once a minute so "expires in X" labels stay current without a
// per-row interval. Invitation TTL is 7 days, so minute-resolution is plenty.
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { nowTimer = setInterval(() => { now.value = Date.now() }, 60_000) })
onUnmounted(() => { if (nowTimer) clearInterval(nowTimer) })

function isInvitationExpired(inv: WorkspaceInvitation): boolean {
  return new Date(inv.expires_at).getTime() <= now.value
}

function invitationStatusLabel(inv: WorkspaceInvitation): string {
  if (isInvitationExpired(inv)) return 'Expired'
  const ms = new Date(inv.expires_at).getTime() - now.value
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days >= 1) return `Expires in ${days} day${days === 1 ? '' : 's'}`
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours >= 1) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`
  const mins = Math.max(1, Math.floor(ms / (1000 * 60)))
  return `Expires in ${mins} min${mins === 1 ? '' : 's'}`
}

const memberSearch = ref('')

type FilterValue = 'all' | 'owner' | 'admin' | 'member' | 'pending'
type SortValue = 'role' | 'nameAZ' | 'nameZA' | 'joinedNewest' | 'joinedOldest'

const filterBy = ref<FilterValue>('all')
const sortBy = ref<SortValue>('role')

const isFilterOpen = ref(false)
const isSortOpen = ref(false)
const filterRef = ref<HTMLElement | null>(null)
const sortRef = ref<HTMLElement | null>(null)

const filterOptions: { value: FilterValue, label: string }[] = [
  { value: 'all', label: 'All members' },
  { value: 'owner', label: 'Owners' },
  { value: 'admin', label: 'Admins' },
  { value: 'member', label: 'Members' },
  { value: 'pending', label: 'Pending invites' },
]

const sortOptions: { value: SortValue, label: string }[] = [
  { value: 'role', label: 'Role' },
  { value: 'nameAZ', label: 'Name (A–Z)' },
  { value: 'nameZA', label: 'Name (Z–A)' },
  { value: 'joinedNewest', label: 'Recently joined' },
  { value: 'joinedOldest', label: 'Joined first' },
]

const roleSortOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 }

type MemberRow = { kind: 'member', member: WorkspaceMember }
type InvitationRow = { kind: 'invitation', invitation: WorkspaceInvitation }
type Row = MemberRow | InvitationRow

function rowSortName(r: Row): string {
  if (r.kind === 'member') return memberDisplayName(r.member)
  return r.invitation.email
}

function rowDate(r: Row): number {
  if (r.kind === 'member') return new Date(r.member.joined_at).getTime()
  return new Date(r.invitation.created_at).getTime()
}

const filteredRows = computed<Row[]>(() => {
  const q = memberSearch.value.toLowerCase().trim()

  let memberRows: MemberRow[] = members.value.map(m => ({ kind: 'member' as const, member: m }))
  let invitationRows: InvitationRow[] = invitations.value.map(i => ({ kind: 'invitation' as const, invitation: i }))

  if (q) {
    memberRows = memberRows.filter(r =>
      (r.member.email?.toLowerCase().includes(q))
      || (r.member.display_name?.toLowerCase().includes(q))
      || r.member.user_id.toLowerCase().includes(q),
    )
    invitationRows = invitationRows.filter(r => r.invitation.email.toLowerCase().includes(q))
  }

  let combined: Row[]
  if (filterBy.value === 'pending') {
    combined = invitationRows
  }
  else if (filterBy.value === 'all') {
    combined = [...memberRows, ...invitationRows]
  }
  else {
    combined = memberRows.filter(r => r.member.role === filterBy.value)
  }

  switch (sortBy.value) {
    case 'role':
      combined.sort((a, b) => {
        // Members (by role) first, invitations last.
        if (a.kind !== b.kind) return a.kind === 'member' ? -1 : 1
        if (a.kind === 'member' && b.kind === 'member') {
          const diff = (roleSortOrder[a.member.role] ?? 99) - (roleSortOrder[b.member.role] ?? 99)
          if (diff !== 0) return diff
        }
        return rowSortName(a).localeCompare(rowSortName(b))
      })
      break
    case 'nameAZ':
      combined.sort((a, b) => rowSortName(a).localeCompare(rowSortName(b)))
      break
    case 'nameZA':
      combined.sort((a, b) => rowSortName(b).localeCompare(rowSortName(a)))
      break
    case 'joinedNewest':
      combined.sort((a, b) => rowDate(b) - rowDate(a))
      break
    case 'joinedOldest':
      combined.sort((a, b) => rowDate(a) - rowDate(b))
      break
  }

  return combined
})

const filteredMemberCount = computed(() => filteredRows.value.filter(r => r.kind === 'member').length)
const filteredInvitationCount = computed(() => filteredRows.value.filter(r => r.kind === 'invitation').length)

// Member and invitation rows share one popover surface — track the active row
// by `member:<userId>` or `invitation:<invitationId>` so menu state can't
// collide when a member and an invitation have similar IDs.
const activeMenuKey = ref<string | null>(null)
const menuPos = ref({ top: 0, left: 0 })

function toggleMenu(key: string, event: MouseEvent) {
  if (activeMenuKey.value === key) {
    activeMenuKey.value = null
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menuPos.value = { top: rect.bottom + 4, left: rect.right - 176 }
  activeMenuKey.value = key
}
function closeMenus() { activeMenuKey.value = null }

const activeMenuMember = computed<WorkspaceMember | null>(() => {
  const key = activeMenuKey.value
  if (!key || !key.startsWith('member:')) return null
  const id = key.slice('member:'.length)
  return members.value.find(m => m.user_id === id) ?? null
})

const activeMenuInvitation = computed<WorkspaceInvitation | null>(() => {
  const key = activeMenuKey.value
  if (!key || !key.startsWith('invitation:')) return null
  const id = key.slice('invitation:'.length)
  return invitations.value.find(i => i.id === id) ?? null
})

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
      const inv = await inviteMember(currentWorkspace.value.id, email, inviteRole.value)
      if (inv) await sendInvitationEmail(inv)
    }
    isInviteOpen.value = false
  }
  finally { isInviting.value = false }
}

async function handleResendInvitation(inv: WorkspaceInvitation) {
  if (!currentWorkspace.value) return
  closeMenus()
  const updated = await resendInvitation(currentWorkspace.value.id, inv.id)
  if (updated) await sendInvitationEmail(updated)
}

// Best-effort email delivery. The invitation row itself is the source of
// truth — if this fails, the user can hit "Resend invitation" from the
// member menu to retry.
async function sendInvitationEmail(inv: WorkspaceInvitation) {
  try {
    await $fetch('/api/invitations/send-email', {
      method: 'POST',
      body: {
        email: inv.email,
        role: inv.role,
        token: inv.token,
        workspaceName: currentWorkspace.value?.name ?? '',
        inviterName: user.value?.email ?? '',
      },
    })
  }
  catch (err) {
    console.warn('[team] failed to send invitation email', err)
  }
}

async function handleRevokeInvitation(inv: WorkspaceInvitation) {
  if (!currentWorkspace.value) return
  closeMenus()
  await revokeInvitation(currentWorkspace.value.id, inv.id)
}

const managingMember = ref<WorkspaceMember | null>(null)
const isManageAccessOpen = ref(false)
const manageAccessRole = ref<string>('member')

function openManageAccess(member: WorkspaceMember) {
  managingMember.value = member
  manageAccessRole.value = member.role
  isManageAccessOpen.value = true
  closeMenus()
}

async function saveManageAccess() {
  if (!currentWorkspace.value || !managingMember.value) return
  await updateMemberRole(currentWorkspace.value.id, managingMember.value.user_id, manageAccessRole.value)
  isManageAccessOpen.value = false
}

async function handleRemoveMember(member: WorkspaceMember) {
  if (!currentWorkspace.value) return
  closeMenus()
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
    closeMenus()
  }
  if (filterRef.value && !filterRef.value.contains(target)) {
    isFilterOpen.value = false
  }
  if (sortRef.value && !sortRef.value.contains(target)) {
    isSortOpen.value = false
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
        <template #header>
          <div class="flex items-center gap-2">
            <div class="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-neutral-200 bg-neutral-50/50 transition focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-950/10">
              <div class="flex size-8 shrink-0 items-center justify-center text-neutral-400">
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              </div>
              <input
                v-model="memberSearch"
                type="text"
                placeholder="Search members..."
                class="min-w-0 flex-1 bg-transparent pr-2 text-body-md text-neutral-950 outline-none placeholder:text-neutral-400"
              >
            </div>

            <button
              v-if="canManageMembers"
              type="button"
              class="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-neutral-950 px-3 text-body-md font-medium text-white transition-colors hover:bg-neutral-800"
              @click="openInviteModal"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Invite
            </button>

            <div ref="filterRef" class="relative shrink-0">
              <button
                type="button"
                class="flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
                @click="isFilterOpen = !isFilterOpen"
              >
                Filter by
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

            <div ref="sortRef" class="relative shrink-0">
              <button
                type="button"
                class="flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-body-md text-neutral-700 transition-colors hover:border-neutral-400 hover:text-neutral-950"
                @click="isSortOpen = !isSortOpen"
              >
                Sort by
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

        <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col p-4 sm:p-5 lg:px-8 lg:pb-6 lg:pt-5">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div
              class="grid shrink-0 items-center border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5 text-[11px] font-medium text-neutral-500"
              style="grid-template-columns: minmax(180px, 1fr) minmax(200px, 1.5fr) 96px 100px; column-gap: 16px;"
            >
              <div class="truncate">Username</div>
              <div class="truncate">Email</div>
              <div class="truncate">Role</div>
              <div class="truncate" aria-hidden="true" />
            </div>

            <div class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <div class="flex flex-col">
                <template v-for="row in filteredRows" :key="row.kind === 'member' ? `m:${row.member.user_id}` : `i:${row.invitation.id}`">
                  <div
                    v-if="row.kind === 'member'"
                    class="grid items-center border-b border-neutral-100 px-3 py-2 transition-colors hover:bg-neutral-50 last:border-b-0"
                    style="grid-template-columns: minmax(180px, 1fr) minmax(200px, 1.5fr) 96px 100px; column-gap: 16px;"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <AccountIcon :initials="memberInitials(row.member)" size="sm" color="bg-neutral-800" />
                      <span class="truncate text-sm font-medium text-neutral-950">{{ memberDisplayName(row.member) }}</span>
                    </div>

                    <div class="truncate text-xs text-neutral-500">
                      {{ memberEmail(row.member) }}
                    </div>

                    <div class="min-w-0">
                      <span
                        class="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-label-md font-medium"
                        :class="roleBadgeClass[row.member.role] || roleBadgeClass.member"
                      >
                        {{ roleLabel(row.member.role) }}
                      </span>
                    </div>

                    <div class="flex items-center justify-end gap-1">
                      <button
                        v-if="canManageMembers && row.member.user_id !== user?.id && row.member.role !== 'owner'"
                        type="button"
                        class="rounded-md px-2 py-1 text-label-md font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        @click="openManageAccess(row.member)"
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        class="member-action-trigger rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        @click.stop="toggleMenu(`member:${row.member.user_id}`, $event)"
                      >
                        <svg class="size-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                      </button>
                    </div>
                  </div>

                  <div
                    v-else
                    class="grid items-center border-b border-neutral-100 px-3 py-2 transition-colors hover:bg-neutral-50 last:border-b-0"
                    style="grid-template-columns: minmax(180px, 1fr) minmax(200px, 1.5fr) 96px 100px; column-gap: 16px;"
                  >
                    <div class="flex min-w-0 items-center gap-2">
                      <div class="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-400">
                        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                      </div>
                      <span class="truncate text-sm font-medium text-neutral-700">{{ row.invitation.email }}</span>
                    </div>

                    <div class="truncate text-xs" :class="isInvitationExpired(row.invitation) ? 'text-red-600' : 'text-neutral-500'">
                      {{ invitationStatusLabel(row.invitation) }}
                    </div>

                    <div class="min-w-0">
                      <span
                        class="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-label-md font-medium"
                        :class="isInvitationExpired(row.invitation)
                          ? 'bg-red-50 text-red-700 ring-1 ring-red-200/60'
                          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60'"
                      >
                        {{ isInvitationExpired(row.invitation) ? 'Expired' : 'Pending' }}
                      </span>
                    </div>

                    <div class="flex items-center justify-end gap-1">
                      <button
                        v-if="canManageMembers"
                        type="button"
                        class="member-action-trigger rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        @click.stop="toggleMenu(`invitation:${row.invitation.id}`, $event)"
                      >
                        <svg class="size-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                      </button>
                    </div>
                  </div>
                </template>

                <div v-if="filteredRows.length === 0" class="py-10 text-center text-body-md text-neutral-400">
                  {{ memberSearch ? 'No matches for your search.' : 'No members found.' }}
                </div>
              </div>
            </div>

            <div class="shrink-0 border-t border-neutral-200 bg-neutral-50/70 px-3 py-1.5 text-[11px] font-medium text-neutral-500">
              {{ filteredMemberCount }} {{ filteredMemberCount === 1 ? 'member' : 'members' }}
              <template v-if="filteredInvitationCount > 0">
                <span class="text-neutral-300"> · </span>{{ filteredInvitationCount }} pending
              </template>
            </div>
          </div>
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
        v-if="activeMenuKey"
        class="member-action-menu fixed z-[9999] w-44 rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden"
        :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px' }"
      >
        <template v-if="activeMenuMember">
          <button
            v-if="canManageMembers && activeMenuMember.user_id !== user?.id && activeMenuMember.role !== 'owner'"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-red-600 transition-colors hover:bg-red-50"
            @click.stop="handleRemoveMember(activeMenuMember)"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
            Remove member
          </button>
          <template v-if="activeMenuMember.user_id === user?.id && activeMenuMember.role !== 'owner'">
            <div class="my-0.5 h-px bg-neutral-200 mx-2" />
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-red-600 transition-colors hover:bg-red-50"
              @click.stop="handleRemoveMember(activeMenuMember)"
            >
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Leave workspace
            </button>
          </template>
        </template>
        <template v-else-if="activeMenuInvitation">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-neutral-700 transition-colors hover:bg-neutral-50"
            @click.stop="handleResendInvitation(activeMenuInvitation)"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" /></svg>
            Resend invitation
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-body-md text-red-600 transition-colors hover:bg-red-50"
            @click.stop="handleRevokeInvitation(activeMenuInvitation)"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
            Revoke invitation
          </button>
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