<script setup lang="ts">
import { ref, nextTick } from 'vue'

withDefaults(
  defineProps<{
    userName?: string
    userRole?: string
  }>(),
  {
    userName: 'Carlvince Tan',
    userRole: 'Lead Software Engineer',
  },
)

const route = useRoute()

const navItems = [
  { to: '/workspace', label: 'Workspace', key: 'workspace' },
  { to: '/vault', label: 'Vault', key: 'vault' },
  { to: '/accounts', label: 'Accounts', key: 'accounts' },
] as const

// Search modal state
const isSearchOpen = ref(false)

function isActive(path: string) {
  if (path === '/dashboard') {
    return route.path === '/dashboard' || route.path.startsWith('/dashboard/')
  }
  if (path === '/workspace') {
    return route.path === '/workspace' || route.path.startsWith('/workspace/')
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}

/** Sidebar primary nav: never show active state while on config (profile is separate, no active cue). */
function isMainNavItemActive(path: string): boolean {
  const p = route.path
  if (p === '/config' || p.startsWith('/config/')) return false
  return isActive(path)
}

// Chat sessions (sidebar list)
const chats = ref([
  'Customer Onboarding',
  'Order Processing',
  'Email Campaign',
])

const renamedChats = ref(new Set<number>([0, 1, 2]))

function isTopChatUnused(): boolean {
  if (chats.value.length === 0) return false
  const top = chats.value[0]
  return top.startsWith('New Chat') && !renamedChats.value.has(0)
}

function createChat() {
  if (isTopChatUnused()) {
    openChat(0)
    return
  }

  const newIndex = chats.value.length
  chats.value.unshift(`New Chat ${newIndex + 1}`)
  openChat(0)
}

const activeChatId = computed(() => route.params.id as string | undefined)
const isChatListItemActive = (index: number) => activeChatId.value === String(index)

function openChat(index: number) {
  const title = chats.value[index]
  navigateTo({
    path: `/chat/${index}/create`,
    query: { name: title },
  })
}

const activeDropdownIndex = ref<number | null>(null)

function canDeleteChat(): boolean {
  return chats.value.length > 1
}

function deleteChat(index: number) {
  if (!canDeleteChat()) return
  chats.value.splice(index, 1)
  const newRenamed = new Set<number>()
  renamedChats.value.forEach((i) => {
    if (i < index) newRenamed.add(i)
    else if (i > index) newRenamed.add(i - 1)
  })
  renamedChats.value = newRenamed
  activeDropdownIndex.value = null
  if (String(index) === activeChatId.value) {
    navigateTo('/dashboard')
  }
}

const editingIndex = ref<number | null>(null)
const editingValue = ref('')

function startRename(index: number) {
  editingIndex.value = index
  editingValue.value = chats.value[index]
  activeDropdownIndex.value = null

  nextTick(() => {
    const input = document.querySelector('input[autofocus]') as HTMLInputElement
    if (input) {
      input.focus()
      const length = input.value.length
      input.setSelectionRange(length, length)
    }
  })
}

function confirmRename(index: number) {
  if (editingValue.value.trim()) {
    chats.value[index] = editingValue.value.trim()
    renamedChats.value.add(index)
  }
  editingIndex.value = null
}

function cancelRename() {
  editingIndex.value = null
  editingValue.value = ''
}

function closeDropdown() {
  activeDropdownIndex.value = null
}

function getDropdownPosition(index: number) {
  const trigger = document.querySelectorAll('.chat-list-trigger')[index]
  if (!trigger) return { top: 0, right: 0 }

  const rect = trigger.getBoundingClientRect()
  return {
    top: rect.bottom,
    left: rect.left,
  }
}

function handleClickOutside(event: MouseEvent) {
  const dropdown = document.querySelector('.chat-list-dropdown')
  if (dropdown && !dropdown.contains(event.target as Node)) {
    const trigger = document.querySelector('.chat-list-trigger')
    if (trigger && !trigger.contains(event.target as Node)) {
      closeDropdown()
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <aside class="flex h-full min-h-0 w-full max-h-full flex-col overflow-hidden bg-neutral-100 py-3 px-3 lg:w-64" aria-label="Main sidebar">
    <!-- Logo & CTA -->
    <div class="shrink-0 space-y-4">
      <div class="flex items-center gap-3">
        <!-- Logo Icon -->
        <div class="flex h-[32px] w-[32px] items-center justify-center rounded-md bg-neutral-950" aria-hidden="true">
          <svg class="size-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <!-- Title & Company -->
        <div class="flex flex-col">
          <span class="text-lg font-bold text-neutral-950">Design Prototype</span>
          <span class="text-caption font-medium tracking-wide text-neutral-500">ARCHETYPE PTY LTD</span>
        </div>
      </div>
      <button type="button" @click="createChat"
        class="w-[212.8px] h-9.5 flex items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-center text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
      </button>
    </div>

    <!-- Navigation (scrollable) -->
    <nav class="mt-10 flex-1 flex flex-col min-h-0 overflow-hidden" aria-label="Main">
      <ul class="flex flex-col gap-1 shrink-0">
        <!-- Dashboard First -->
        <li>
          <NuxtLink to="/dashboard"
            class="relative flex items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            :class="(!isSearchOpen && isMainNavItemActive('/dashboard'))
              ? 'font-semibold'
              : 'hover:bg-neutral-200/60'">
            <span v-if="!isSearchOpen && isMainNavItemActive('/dashboard')"
              class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-neutral-950"
              aria-hidden="true" />
            <!-- Dashboard: layout grid -->
            <svg class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Dashboard</span>
          </NuxtLink>
        </li>

        <!-- Search - Between Dashboard and Workspace -->
        <li>
          <button type="button" @click="isSearchOpen = true"
            class="relative flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            :class="isSearchOpen ? 'font-semibold' : 'hover:bg-neutral-200/60'">
            <span v-if="isSearchOpen"
              class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-neutral-950"
              aria-hidden="true" />
            <svg class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>Search</span>
          </button>
        </li>

        <!-- Rest of nav items: Workspace, Vault, Accounts -->
        <li v-for="item in navItems" :key="item.key">
          <NuxtLink :to="item.to"
            class="relative flex items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            :class="(!isSearchOpen && isMainNavItemActive(item.to))
              ? 'font-semibold'
              : 'hover:bg-neutral-200/60'
              ">
            <span v-if="!isSearchOpen && isMainNavItemActive(item.to)"
              class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-neutral-950"
              aria-hidden="true" />
            <!-- Workspace: presentation stand -->
            <svg v-if="item.key === 'workspace'" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 3h20" />
              <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" />
              <path d="m7 21 5-5 5 5" />
            </svg>
            <!-- Vault: lock -->
            <svg v-else-if="item.key === 'vault'" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <!-- Accounts: user -->
            <svg v-else-if="item.key === 'accounts'" class="size-4 shrink-0 text-neutral-950" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 20v-1a6 6 0 0112 0v1" />
            </svg>
            <span>
              {{ item.label }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <!-- Chats -->
      <div class="mt-6 flex flex-col flex-1 min-h-0 relative">
        <h3 class="mb-2 pl-2.5 text-meta font-semibold uppercase tracking-wide text-neutral-500 shrink-0">Chats
        </h3>
        <ul class="flex flex-col gap-0.5 flex-1 overflow-y-auto scrollbar-hide relative">
          <li v-for="(title, index) in chats" :key="index" class="relative">
            <div v-if="editingIndex !== index" @click="openChat(index)"
              class="group relative flex w-full cursor-pointer items-center justify-between rounded-md py-1.5 pl-2.5 pr-2 text-left text-nav text-neutral-950 transition-colors"
              :class="isChatListItemActive(index) ? 'bg-neutral-300' : 'hover:bg-neutral-200/90'">
              <span class="truncate" @dblclick.stop="startRename(index)">{{ title }}</span>
              <div class="relative" @click.stop>
                <svg @click="activeDropdownIndex = activeDropdownIndex === index ? null : index"
                  class="chat-list-trigger size-4 shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer hover:text-neutral-950"
                  viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="6" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="18" cy="12" r="2" />
                </svg>

                <div v-if="activeDropdownIndex === index"
                  class="fixed z-9999 mt-1 w-32 rounded-md bg-white py-1 shadow-lg ring-1 ring-neutral-200 overflow-hidden chat-list-dropdown"
                  :style="{ top: getDropdownPosition(index).top + 'px', left: getDropdownPosition(index).left + 'px' }">
                  <button @click.stop
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-100 cursor-pointer transition-colors">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Share
                  </button>
                  <button @click.stop="startRename(index)"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav text-neutral-950 hover:bg-neutral-100 cursor-pointer transition-colors">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Rename
                  </button>
                  <div class="my-0.5 h-px bg-neutral-200 mx-2"></div>
                  <button @click.stop="deleteChat(index)" :disabled="!canDeleteChat()"
                    class="flex w-full items-center gap-2 px-2.5 py-1.5 text-nav transition-colors" :class="canDeleteChat()
                      ? 'text-red-600 hover:bg-red-50 cursor-pointer'
                      : 'text-red-300 cursor-not-allowed'">
                    <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>

            <div v-else
              class="group relative flex w-full items-center justify-between rounded-md py-1.5 pl-2.5 pr-2 text-left text-nav text-neutral-950">
              <input v-model="editingValue" @keyup.enter="confirmRename(index)" @keyup.esc="cancelRename"
                @blur="confirmRename(index)" type="text"
                class="flex-1 bg-transparent border-0 border-b border-neutral-400 outline-none min-w-0 py-0.75 m-0 h-auto leading-normal"
                autofocus />
            </div>
          </li>
        </ul>
        <div
          class="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-neutral-100 to-transparent pointer-events-none z-10">
        </div>
      </div>
    </nav>

    <div class="mt-auto shrink-0 border-t border-neutral-200/80 pt-2">
      <NuxtLink
        to="/config"
        class="flex items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-nav text-neutral-950 transition-colors hover:bg-neutral-200/60 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
      >
        <div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-white" role="img"
          aria-label="User profile">
          <svg class="size-4 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            aria-hidden="true">
            <circle cx="12" cy="8" r="3" />
            <path d="M6 20v-1a6 6 0 0112 0v1" />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-neutral-950">
            {{ userName }}
          </p>
          <p class="truncate text-meta text-neutral-600">
            {{ userRole }}
          </p>
        </div>
      </NuxtLink>
    </div>

    <SearchModal v-model:open="isSearchOpen" />
  </aside>
</template>
