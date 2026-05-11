<script setup lang="ts">
import type { User } from '@supabase/supabase-js'
import type { WorkspaceInvitation, WorkspaceMember } from '~/composables/account/useWorkspaces'

const isOpen = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const supabaseUser = useSupabaseUser()
const supabase = useSupabaseClient()

// `useSupabaseUser()` returns a useState wrapper that, in this teleported
// modal, comes back as an empty placeholder (truthy but with no `.id`) before
// the auth listener fires — so we can't rely on it for self-row detection.
// Resolve the auth user ourselves from the supabase session as a fallback.
function hasId(u: User | null | undefined | Record<string, never>): u is User {
  return !!u && typeof (u as User).id === 'string' && (u as User).id.length > 0
}

const resolvedUser = ref<User | null>(hasId(supabaseUser.value) ? supabaseUser.value : null)
watchEffect(() => { if (hasId(supabaseUser.value)) resolvedUser.value = supabaseUser.value })

async function ensureResolvedUser() {
  if (hasId(resolvedUser.value)) return
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user) {
    resolvedUser.value = sessionData.session.user
    return
  }
  const { data: userData } = await supabase.auth.getUser()
  if (userData.user) resolvedUser.value = userData.user
}

onMounted(ensureResolvedUser)
watch(isOpen, (open) => { if (open) ensureResolvedUser() })

const user = resolvedUser

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
  transferOwnership,
  removeMember,
  leaveWorkspace,
} = useWorkspaces()

const myRole = computed(() => {
  if (currentWorkspace.value?.role) return currentWorkspace.value.role
  if (!user.value || !members.value.length) return null
  return members.value.find(m => m.user_id === user.value!.id)?.role ?? null
})
const canManageMembers = computed(() => myRole.value === 'owner' || myRole.value === 'admin')

function loadData() {
  const ws = currentWorkspace.value
  if (!ws) return
  fetchMembers(ws.id)
  if (canManageMembers.value) fetchInvitations(ws.id)
}

watch(isOpen, (open) => {
  if (!open) return
  loadData()
})

// Live clock for invitation countdowns.
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

watch(isOpen, (open) => {
  if (open && !nowTimer) {
    nowTimer = setInterval(() => { now.value = Date.now() }, 60_000)
  }
  else if (!open && nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

onUnmounted(() => { if (nowTimer) clearInterval(nowTimer) })

function isInvitationExpired(inv: WorkspaceInvitation): boolean {
  return new Date(inv.expires_at).getTime() <= now.value
}

function invitationStatusLabel(inv: WorkspaceInvitation): string {
  if (isInvitationExpired(inv)) return t('workspaceMenu.invExpired')
  const ms = new Date(inv.expires_at).getTime() - now.value
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days >= 1) return t('workspaceMenu.invExpiresDays', { n: days })
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours >= 1) return t('workspaceMenu.invExpiresHours', { n: hours })
  const mins = Math.max(1, Math.floor(ms / (1000 * 60)))
  return t('workspaceMenu.invExpiresMins', { n: mins })
}

const memberSearch = ref('')

const currentUserAvatarUrl = computed<string | null>(() => {
  const meta = user.value?.user_metadata
  return (meta?.avatar_url as string | undefined) || (meta?.picture as string | undefined) || null
})
const currentUserAvatarFailed = ref(false)
watch(currentUserAvatarUrl, () => { currentUserAvatarFailed.value = false })

type MemberRow = { kind: 'member', member: WorkspaceMember }
type InvitationRow = { kind: 'invitation', invitation: WorkspaceInvitation }
type Row = MemberRow | InvitationRow

const roleSortOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 }

function memberDisplayName(m: WorkspaceMember) {
  return m.display_name || m.email?.split('@')[0] || m.user_id.substring(0, 8) + '…'
}
function memberEmail(m: WorkspaceMember) {
  return m.email || '—'
}
function memberInitials(m: WorkspaceMember) {
  const name = m.display_name || m.email || m.user_id
  return name.split(/\s+/).map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
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

  const combined: Row[] = [...memberRows, ...invitationRows]
  combined.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'member' ? -1 : 1
    if (a.kind === 'member' && b.kind === 'member') {
      const diff = (roleSortOrder[a.member.role] ?? 99) - (roleSortOrder[b.member.role] ?? 99)
      if (diff !== 0) return diff
      return memberDisplayName(a.member).localeCompare(memberDisplayName(b.member))
    }
    if (a.kind === 'invitation' && b.kind === 'invitation') {
      return a.invitation.email.localeCompare(b.invitation.email)
    }
    return 0
  })
  return combined
})

const memberCount = computed(() => filteredRows.value.filter(r => r.kind === 'member').length)
const pendingCount = computed(() => filteredRows.value.filter(r => r.kind === 'invitation').length)

// Per-row action menu
const activeMenuKey = ref<string | null>(null)
const menuPos = ref({ top: 0, left: 0 })

function toggleMenu(key: string, event: MouseEvent) {
  if (activeMenuKey.value === key) { activeMenuKey.value = null; return }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  // The menu is rendered at body level via Teleport so it can escape the modal,
  // but we still need to keep it inside the viewport. Estimate height (44 px per
  // item × max 2 items + 8 px padding) — enough to flip up if the trigger is
  // near the bottom. Width is fixed at w-44 = 176 px.
  const menuWidth = 176
  const estimatedHeight = 100
  const margin = 8
  const preferredTop = rect.bottom + 4
  const fitsBelow = preferredTop + estimatedHeight + margin <= window.innerHeight
  const top = fitsBelow
    ? preferredTop
    : Math.max(margin, rect.top - estimatedHeight - 4)
  const preferredLeft = rect.right - menuWidth
  const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - menuWidth - margin))
  menuPos.value = { top, left }
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

// Invite
const isInviteOpen = ref(false)
const inviteEmails = ref('')
const inviteRole = ref<'admin' | 'member'>('member')
const isInviting = ref(false)

function openInviteModal() {
  inviteEmails.value = ''
  inviteRole.value = 'member'
  isInviteOpen.value = true
}

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
    console.warn('[manage-members] failed to send invitation email', err)
  }
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
  finally {
    isInviting.value = false
  }
}

async function handleResendInvitation(inv: WorkspaceInvitation) {
  if (!currentWorkspace.value) return
  closeMenus()
  const updated = await resendInvitation(currentWorkspace.value.id, inv.id)
  if (updated) await sendInvitationEmail(updated)
}

async function handleRevokeInvitation(inv: WorkspaceInvitation) {
  if (!currentWorkspace.value) return
  closeMenus()
  await revokeInvitation(currentWorkspace.value.id, inv.id)
}

async function handleRemoveMember(m: WorkspaceMember) {
  if (!currentWorkspace.value) return
  closeMenus()
  await removeMember(currentWorkspace.value.id, m.user_id)
}

async function handlePromoteToAdmin(m: WorkspaceMember) {
  if (!currentWorkspace.value) return
  closeMenus()
  await updateMemberRole(currentWorkspace.value.id, m.user_id, 'admin')
}

async function handleDemoteToMember(m: WorkspaceMember) {
  if (!currentWorkspace.value) return
  closeMenus()
  await updateMemberRole(currentWorkspace.value.id, m.user_id, 'member')
}

async function handleTransferOwnership(m: WorkspaceMember) {
  if (!currentWorkspace.value || !user.value) return
  closeMenus()
  await transferOwnership(currentWorkspace.value.id, m.user_id, user.value.id)
}

async function handleLeaveWorkspace() {
  if (!currentWorkspace.value || !user.value) return
  closeMenus()
  await leaveWorkspace(currentWorkspace.value.id, user.value.id)
  isOpen.value = false
}

type IconKey = 'shield-up' | 'shield-down' | 'crown' | 'user-minus' | 'logout'

interface MemberMenuAction {
  key: 'promote-admin' | 'promote-owner' | 'demote-member' | 'remove' | 'leave'
  label: string
  icon: IconKey
  destructive?: boolean
  run: (m: WorkspaceMember) => void | Promise<void>
}

function memberActions(m: WorkspaceMember): MemberMenuAction[] {
  const isSelf = m.user_id === user.value?.id

  if (isSelf) {
    if (m.role === 'owner') return []
    return [{
      key: 'leave',
      label: t('workspaceMenu.leaveWorkspace'),
      icon: 'logout',
      destructive: true,
      run: () => handleLeaveWorkspace(),
    }]
  }

  if (!canManageMembers.value) return []

  const actions: MemberMenuAction[] = []
  if (m.role === 'member') {
    actions.push({
      key: 'promote-admin',
      label: t('workspaceMenu.makeAdmin'),
      icon: 'shield-up',
      run: handlePromoteToAdmin,
    })
  }
  else if (m.role === 'admin') {
    if (myRole.value === 'owner') {
      actions.push({
        key: 'promote-owner',
        label: t('workspaceMenu.transferOwnership'),
        icon: 'crown',
        destructive: true,
        run: handleTransferOwnership,
      })
    }
    actions.push({
      key: 'demote-member',
      label: t('workspaceMenu.makeMember'),
      icon: 'shield-down',
      run: handleDemoteToMember,
    })
  }
  if (m.role !== 'owner') {
    actions.push({
      key: 'remove',
      label: t('workspaceMenu.removeMember'),
      icon: 'user-minus',
      destructive: true,
      run: handleRemoveMember,
    })
  }
  return actions
}

function memberHasActions(m: WorkspaceMember): boolean {
  return memberActions(m).length > 0
}

// Manage member (change role)
const managingMember = ref<WorkspaceMember | null>(null)
const isManageAccessOpen = ref(false)
const manageAccessRole = ref<string>('member')
const roles = ['owner', 'admin', 'member'] as const

function openManageAccess(member: WorkspaceMember) {
  managingMember.value = member
  manageAccessRole.value = member.role
  isManageAccessOpen.value = true
  closeMenus()
}

function closeManageAccess() {
  isManageAccessOpen.value = false
  managingMember.value = null
}

async function saveManageAccess() {
  if (!currentWorkspace.value || !managingMember.value) return
  await updateMemberRole(currentWorkspace.value.id, managingMember.value.user_id, manageAccessRole.value)
  closeManageAccess()
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

const roleBadgeClass: Record<string, string> = {
  owner: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60',
  admin: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60',
  member: 'bg-neutral-100 text-neutral-600',
}

function close() { isOpen.value = false }

function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (isManageAccessOpen.value) { closeManageAccess(); return }
  if (isInviteOpen.value) { isInviteOpen.value = false; return }
  if (activeMenuKey.value) { closeMenus(); return }
  close()
}

// Use capture phase so this fires before any inner @click.stop handlers
// (e.g. the modal content's @click.stop) — without capture, clicks inside
// the modal would never reach this handler and the action menu wouldn't close.
function handleClickOutsideMenu(event: MouseEvent) {
  if (!activeMenuKey.value) return
  const target = event.target as Node
  const menu = document.querySelector('.mm-action-menu')
  if (menu && menu.contains(target)) return
  const triggers = document.querySelectorAll('.mm-action-trigger')
  for (const el of Array.from(triggers)) {
    if (el.contains(target)) return
  }
  closeMenus()
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('mousedown', handleClickOutsideMenu, true)
  }
  else {
    document.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('mousedown', handleClickOutsideMenu, true)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousedown', handleClickOutsideMenu, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="close"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isOpen"
            class="flex h-[560px] max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            aria-label="Manage members"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3.5">
              <h2 class="text-sm font-semibold text-neutral-950">{{ t('workspaceMenu.manageMembers') }}</h2>
              <button
                type="button"
                class="p-1 text-neutral-400 transition-colors hover:text-neutral-950"
                @click="close"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <!-- Toolbar -->
            <div class="flex items-center gap-2 px-5 pb-2 pt-3">
              <div class="flex h-6 min-w-0 flex-1 items-center rounded-md border border-neutral-200 bg-neutral-50/50 transition focus-within:border-neutral-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-950/10">
                <div class="flex size-6 shrink-0 items-center justify-center text-neutral-400">
                  <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                </div>
                <input
                  v-model="memberSearch"
                  type="text"
                  :placeholder="t('workspaceMenu.searchMembers')"
                  class="min-w-0 flex-1 bg-transparent pr-2 text-[11px] text-neutral-950 outline-none placeholder:text-neutral-400"
                />
              </div>
              <button
                v-if="canManageMembers"
                type="button"
                class="flex size-6 shrink-0 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-950"
                :title="t('workspaceMenu.invite')"
                :aria-label="t('workspaceMenu.invite')"
                @click="openInviteModal"
              >
                <svg class="size-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </button>
            </div>

            <!-- Members list -->
            <div class="flex-1 overflow-y-auto">
              <ul class="divide-y divide-neutral-100">
                <template v-for="row in filteredRows" :key="row.kind === 'member' ? `m:${row.member.user_id}` : `i:${row.invitation.id}`">
                  <li
                    v-if="row.kind === 'member'"
                    class="group flex items-center gap-3 px-5 py-2.5 transition-colors"
                    :class="row.member.user_id === user?.id ? 'pointer-events-none bg-neutral-50/60 opacity-50' : 'hover:bg-neutral-50'"
                  >
                    <template v-if="row.member.user_id === user?.id && currentUserAvatarUrl && !currentUserAvatarFailed">
                      <img
                        :src="currentUserAvatarUrl"
                        referrerpolicy="no-referrer"
                        class="h-4 w-4 shrink-0 rounded-md object-cover ring-1 ring-neutral-200/80"
                        alt=""
                        @error="currentUserAvatarFailed = true"
                      />
                    </template>
                    <AccountIcon v-else :initials="memberInitials(row.member)" size="sm" color="bg-neutral-800" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs font-medium text-neutral-950">{{ memberDisplayName(row.member) }}</p>
                      <p class="truncate text-[11px] text-neutral-500">{{ memberEmail(row.member) }}</p>
                    </div>
                    <span
                      class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      :class="roleBadgeClass[row.member.role] || roleBadgeClass.member"
                    >
                      {{ roleLabel(row.member.role) }}
                    </span>
                    <div class="flex shrink-0 items-center gap-1">
                      <button
                        v-if="canManageMembers && row.member.user_id !== user?.id && row.member.role !== 'owner'"
                        type="button"
                        class="rounded-md px-2 py-1 text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        @click="openManageAccess(row.member)"
                      >
                        {{ t('common.manage') }}
                      </button>
                      <button
                        type="button"
                        class="rounded-md p-1 text-neutral-400 transition-colors"
                        :class="row.member.user_id === user?.id
                          ? 'cursor-default'
                          : 'mm-action-trigger hover:bg-neutral-100 hover:text-neutral-700'"
                        :disabled="row.member.user_id === user?.id"
                        @click.stop="toggleMenu(`member:${row.member.user_id}`, $event)"
                      >
                        <svg class="size-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                      </button>
                    </div>
                  </li>

                  <li
                    v-else
                    class="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-neutral-50"
                  >
                    <div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-400">
                      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs font-medium text-neutral-700">{{ row.invitation.email }}</p>
                      <p
                        class="truncate text-[11px]"
                        :class="isInvitationExpired(row.invitation) ? 'text-red-600' : 'text-neutral-500'"
                      >
                        {{ invitationStatusLabel(row.invitation) }}
                      </p>
                    </div>
                    <span
                      class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      :class="isInvitationExpired(row.invitation)
                        ? 'bg-red-50 text-red-700 ring-1 ring-red-200/60'
                        : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60'"
                    >
                      {{ isInvitationExpired(row.invitation) ? t('workspaceMenu.invExpired') : t('workspaceMenu.invPending') }}
                    </span>
                    <div class="flex shrink-0 items-center gap-1">
                      <button
                        v-if="canManageMembers"
                        type="button"
                        class="mm-action-trigger rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        @click.stop="toggleMenu(`invitation:${row.invitation.id}`, $event)"
                      >
                        <svg class="size-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                      </button>
                    </div>
                  </li>
                </template>

                <li v-if="filteredRows.length === 0" class="px-5 py-10 text-center text-xs text-neutral-400">
                  {{ memberSearch ? t('workspaceMenu.noMatches') : t('workspaceMenu.noMembers') }}
                </li>
              </ul>
            </div>

            <!-- Footer -->
            <div class="shrink-0 border-t border-neutral-100 bg-neutral-50/60 px-5 py-2 text-[11px] font-medium text-neutral-500">
              {{ memberCount }} {{ memberCount === 1 ? t('workspaceMenu.memberSingular') : t('workspaceMenu.memberPlural') }}
              <template v-if="pendingCount > 0">
                <span class="text-neutral-300"> · </span>{{ pendingCount }} {{ t('workspaceMenu.pendingLabel') }}
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Per-row action menu -->
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
        class="mm-action-menu fixed z-[70] w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-neutral-200"
        :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px' }"
      >
        <template v-if="activeMenuMember">
          <button
            v-for="action in memberActions(activeMenuMember)"
            :key="action.key"
            type="button"
            class="flex w-full items-center px-3 py-2 text-xs transition-colors"
            :class="action.destructive
              ? 'text-red-600 hover:bg-red-50'
              : 'text-neutral-700 hover:bg-neutral-50'"
            @click.stop="action.run(activeMenuMember)"
          >
            {{ action.label }}
          </button>
          <div
            v-if="memberActions(activeMenuMember).length === 0"
            class="px-3 py-2 text-xs text-neutral-400"
          >
            {{ t('workspaceMenu.noAvailableActions') }}
          </div>
        </template>
        <template v-else-if="activeMenuInvitation">
          <button
            type="button"
            class="flex w-full items-center px-3 py-2 text-xs text-neutral-700 transition-colors hover:bg-neutral-50"
            @click.stop="handleResendInvitation(activeMenuInvitation)"
          >
            {{ t('workspaceMenu.resendInvite') }}
          </button>
          <button
            type="button"
            class="flex w-full items-center px-3 py-2 text-xs text-red-600 transition-colors hover:bg-red-50"
            @click.stop="handleRevokeInvitation(activeMenuInvitation)"
          >
            {{ t('workspaceMenu.revokeInvite') }}
          </button>
        </template>
      </div>
    </Transition>

    <!-- Invite modal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isInviteOpen"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="isInviteOpen = false"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isInviteOpen"
            class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="flex items-start justify-between border-b border-neutral-100 px-5 py-3.5">
              <div>
                <h3 class="text-sm font-semibold text-neutral-950">{{ t('workspaceMenu.inviteMembers') }}</h3>
                <p class="mt-0.5 text-[11px] text-neutral-500">{{ t('workspaceMenu.inviteDesc') }}</p>
              </div>
              <button
                type="button"
                class="p-1 text-neutral-400 transition-colors hover:text-neutral-950"
                @click="isInviteOpen = false"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div class="space-y-3 px-5 py-4">
              <div>
                <label class="block text-[11px] font-medium text-neutral-600">{{ t('workspaceMenu.emailAddresses') }}</label>
                <p class="mt-0.5 text-[11px] text-neutral-400">{{ t('workspaceMenu.commaHint') }}</p>
                <textarea
                  v-model="inviteEmails"
                  rows="3"
                  placeholder="alice@example.com, bob@example.com"
                  class="mt-1.5 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10 placeholder:text-neutral-400"
                />
              </div>
              <div>
                <label class="block text-[11px] font-medium text-neutral-600">{{ t('workspaceMenu.role') }}</label>
                <select
                  v-model="inviteRole"
                  class="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                >
                  <option value="admin">{{ t('workspaceMenu.roleAdminLabel') }}</option>
                  <option value="member">{{ t('workspaceMenu.roleMemberLabel') }}</option>
                </select>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
                @click="isInviteOpen = false"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                :disabled="isInviting || !inviteEmails.trim()"
                @click="handleSendInvitations"
              >
                {{ isInviting ? t('workspaceMenu.sending') : t('workspaceMenu.sendInvitation') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Manage access modal -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isManageAccessOpen"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        @click.self="closeManageAccess"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isManageAccessOpen"
            class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="flex items-start justify-between border-b border-neutral-100 px-5 py-3.5">
              <div>
                <h3 class="text-sm font-semibold text-neutral-950">{{ t('workspaceMenu.manageAccess') }}</h3>
                <p class="mt-0.5 text-[11px] text-neutral-500">
                  {{ t('workspaceMenu.changeRoleFor', { name: managingMember ? memberDisplayName(managingMember) : '' }) }}
                </p>
              </div>
              <button
                type="button"
                class="p-1 text-neutral-400 transition-colors hover:text-neutral-950"
                @click="closeManageAccess"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div v-if="managingMember" class="space-y-3 px-5 py-4">
              <div class="flex items-center gap-3">
                <AccountIcon :initials="memberInitials(managingMember)" size="md" color="bg-neutral-800" />
                <div class="min-w-0">
                  <p class="truncate text-xs font-medium text-neutral-950">{{ memberDisplayName(managingMember) }}</p>
                  <p class="truncate text-[11px] text-neutral-400">{{ memberEmail(managingMember) }}</p>
                </div>
              </div>
              <div>
                <label class="block text-[11px] font-medium text-neutral-600">{{ t('workspaceMenu.role') }}</label>
                <select
                  v-model="manageAccessRole"
                  class="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
                >
                  <option v-for="r in roles" :key="r" :value="r" :disabled="r === 'owner' && myRole !== 'owner'">
                    {{ roleLabel(r) }}
                  </option>
                </select>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
              <button
                type="button"
                class="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50"
                @click="closeManageAccess"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                :disabled="manageAccessRole === managingMember?.role"
                @click="saveManageAccess"
              >
                {{ t('common.save') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
