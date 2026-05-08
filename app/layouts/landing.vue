<script setup lang="ts">
const route = useRoute()
const mobileOpen = ref(false)
const user = useSupabaseUser()
const { signOut } = useSignOut()

const isProfileDropdownOpen = ref(false)
const profileMenuRef = ref<HTMLElement | null>(null)

function closeProfileDropdown() {
    isProfileDropdownOpen.value = false
}

function handleLandingSettings() {
    closeProfileDropdown()
    navigateTo('/dashboard/settings')
}

async function handleLandingSignOut() {
    closeProfileDropdown()
    await signOut()
}

function handleProfileClickOutside(event: MouseEvent) {
    const target = event.target as Node
    const insideMenu = profileMenuRef.value?.contains(target)
    const insideTrigger = document.querySelector('.landing-profile-trigger')?.contains(target)
    if (!insideMenu && !insideTrigger) closeProfileDropdown()
}

const displayName = computed(() => {
    if (!user.value) return ''
    const meta = user.value.user_metadata
    return (meta?.full_name as string | undefined)
        || (meta?.name as string | undefined)
        || user.value.email?.split('@')[0]
        || ''
})

const avatarUrl = computed(() => {
    const meta = user.value?.user_metadata
    return (meta?.avatar_url as string | undefined)
        || (meta?.picture as string | undefined)
        || null
})

const initials = computed(() => {
    const name = displayName.value.trim() || 'U'
    return name.split(/\s+/).map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
})
const activeSection = ref<string | null>(null)

/** Update the browser address bar hash without triggering Vue Router scroll behavior. */
function replaceHash(hash: string) {
    if (!import.meta.client) return
    const url = window.location.pathname + window.location.search + hash
    history.replaceState(history.state, '', url)
}

const homePaths = new Set(['/', '/landing'])

/**
 * True after a header click or hash deep-link: underline follows the chosen item only,
 * not scroll position, until the animated scroll settles (scrollend / timeout).
 */
const navLockedToHeader = ref(false)

/** Pixels from top of `#landing-scroll`; below this we treat nav as "Home". */
const LANDING_TOP_SCROLL_SLACK = 80

let navHeaderLockReleaseTimer: ReturnType<typeof setTimeout> | null = null
/** Bumped on each new header-driven scroll so stale scrollend/timeouts cannot unlock a newer lock. */
let navHeaderLockGeneration = 0

function clearNavHeaderLockTimer() {
    if (navHeaderLockReleaseTimer) {
        clearTimeout(navHeaderLockReleaseTimer)
        navHeaderLockReleaseTimer = null
    }
}

function releaseNavHeaderLock() {
    clearNavHeaderLockTimer()
    navLockedToHeader.value = false
    syncActiveSectionFromScroll()
    navHeaderLockGeneration++
}

function armNavHeaderLockRelease() {
    clearNavHeaderLockTimer()
    const gen = navHeaderLockGeneration
    navHeaderLockReleaseTimer = setTimeout(() => {
        navHeaderLockReleaseTimer = null
        if (navLockedToHeader.value && gen === navHeaderLockGeneration) {
            navLockedToHeader.value = false
            syncActiveSectionFromScroll()
            navHeaderLockGeneration++
        }
    }, 1500)
}

function isHomeRoute() {
    return homePaths.has(route.path)
}

function scrollToSection(id: string) {
    mobileOpen.value = false
    const onHome = isHomeRoute()
    if (onHome) {
        if (id === 'features' || id === 'pricing') {
            navHeaderLockGeneration++
            navLockedToHeader.value = true
            activeSection.value = id
            armNavHeaderLockRelease()
            replaceHash(`#${id}`)
        }
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
    }
    navigateTo({ path: '/', hash: `#${id}` })
}

function scrollToHome() {
    mobileOpen.value = false
    if (isHomeRoute()) {
        navHeaderLockGeneration++
        navLockedToHeader.value = true
        activeSection.value = null
        armNavHeaderLockRelease()
        replaceHash('')
        const root = document.getElementById('landing-scroll')
        root?.scrollTo({ top: 0, behavior: 'smooth' })
        return
    }
    clearNavHeaderLockTimer()
    navigateTo('/')
}

/** Offset from scroll top so the sticky header + nav underline aligns with section titles. */
const SECTION_NAV_ANCHOR_OFFSET = 96

function elementOffsetInScrollRoot(el: HTMLElement, scrollRoot: HTMLElement): number {
    return el.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop
}

/** Underline from scroll position when the user scrolls manually (header lock off). Only updates `activeSection` — no router calls here so manual scrolling is never interrupted. */
function syncActiveSectionFromScroll() {
    if (!isHomeRoute()) return
    if (navLockedToHeader.value) return

    const root = document.getElementById('landing-scroll')
    if (!root) return

    if (root.scrollTop <= LANDING_TOP_SCROLL_SLACK) {
        activeSection.value = null
        return
    }

    const features = document.getElementById('features')
    const pricing = document.getElementById('pricing')
    if (!features || !pricing) return

    const anchor = root.scrollTop + SECTION_NAV_ANCHOR_OFFSET
    const fTop = elementOffsetInScrollRoot(features, root)
    const pTop = elementOffsetInScrollRoot(pricing, root)

    if (anchor >= pTop) activeSection.value = 'pricing'
    else if (anchor >= fTop) activeSection.value = 'features'
    else activeSection.value = null
}

/** Update the URL hash once scrolling has fully settled — uses history.replaceState so no router scroll behavior fires. */
function syncLandingHashFromScrollPosition() {
    if (!isHomeRoute()) return
    if (navLockedToHeader.value) return

    const desired =
        activeSection.value === 'features' || activeSection.value === 'pricing'
            ? `#${activeSection.value}`
            : ''
    const current = window.location.hash
    if (current === desired) return

    replaceHash(desired)
}

function onLandingScroll() {
    syncActiveSectionFromScroll()
}

let landingScrollEl: HTMLElement | null = null

function attachLandingScrollHandlers() {
    landingScrollEl?.removeEventListener('scroll', onLandingScroll)
    landingScrollEl = document.getElementById('landing-scroll')
    landingScrollEl?.addEventListener('scroll', onLandingScroll, { passive: true })
}

function onLandingScrollEnd() {
    if (navLockedToHeader.value) {
        releaseNavHeaderLock()
    } else {
        syncActiveSectionFromScroll()
        syncLandingHashFromScrollPosition()
    }
}

/** Scroll root is `#landing-scroll`; reset after client navigations (e.g. footer links). */
function scrollLandingToTop() {
    const root = document.getElementById('landing-scroll')
    if (root) root.scrollTop = 0
}

onMounted(() => {
    attachLandingScrollHandlers()
    landingScrollEl?.addEventListener('scrollend', onLandingScrollEnd)
    document.addEventListener('click', handleProfileClickOutside)
    nextTick(() => {
        if (!homePaths.has(route.path)) scrollLandingToTop()
        syncActiveSectionFromScroll()
    })
})

watch(
    () => route.fullPath,
    async () => {
        if (!homePaths.has(route.path)) {
            clearNavHeaderLockTimer()
            navLockedToHeader.value = false
            activeSection.value = null
            navHeaderLockGeneration++
            await nextTick()
            scrollLandingToTop()
            return
        }

        attachLandingScrollHandlers()

        const hash = route.hash?.replace(/^#/, '')
        if (hash === 'features' || hash === 'pricing') {
            navHeaderLockGeneration++
            navLockedToHeader.value = true
            activeSection.value = hash as 'features' | 'pricing'
            armNavHeaderLockRelease()
            await nextTick()
            document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
            clearNavHeaderLockTimer()
            navLockedToHeader.value = false
            scrollLandingToTop()
        }

        await nextTick()
        syncActiveSectionFromScroll()
    },
)

onUnmounted(() => {
    clearNavHeaderLockTimer()
    landingScrollEl?.removeEventListener('scroll', onLandingScroll)
    landingScrollEl?.removeEventListener('scrollend', onLandingScrollEnd)
    landingScrollEl = null
    document.removeEventListener('click', handleProfileClickOutside)
})

function isActiveHome() {
    return isHomeRoute() && activeSection.value === null
}

function isActiveSection(section: string) {
    if (!isHomeRoute()) return false
    return activeSection.value === section
}

function isActiveNavPath(path: string) {
    return route.path === path
}

const linkGroups = [
    {
        title: 'Product',
        links: [
            { label: 'Home', to: '/' },
            { label: 'Features', to: '/#features' },
            { label: 'Pricing', to: '/#pricing' },
        ],
    },
    {
        title: 'Community',
        links: [
            { label: 'Blog', to: '/blog' },
            { label: 'Development', to: '/development' },
            { label: 'Forum', to: '/forum' },
        ],
    },
    {
        title: 'Company',
        links: [
            { label: 'About us', to: '/about-us' },
            { label: 'Contact Us', to: '/contact' },
        ],
    },
    {
        title: 'Legal',
        links: [
            { label: 'Privacy Policy', to: '/privacy-policy' },
            { label: 'Terms of Service', to: '/terms-of-service' },
            { label: 'Cookie Policy', to: '/cookie-policy' },
        ],
    },
]
</script>

<template>
    <div id="landing-scroll"
        class="flex h-dvh max-h-dvh min-h-0 flex-col overflow-y-auto overflow-x-hidden scroll-smooth bg-white">
        <header class="sticky top-0 z-50 border-b border-neutral-200/40 bg-white/80 backdrop-blur-xl">
            <div class="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
                <div class="flex items-center gap-8">
                    <button type="button" class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-inherit"
                        aria-label="Home" @click="scrollToHome">
                        <InlineLogo size="xl" />
                    </button>

                    <nav class="hidden items-center gap-1 md:flex">
                        <button type="button"
                            class="relative px-3 pb-1 pt-0.5 text-base font-semibold tracking-tight transition-colors"
                            :class="isActiveHome()
                                    ? 'text-neutral-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-neutral-950'
                                    : 'text-neutral-400 hover:text-neutral-600'
                                " @click="scrollToHome">
                            Home
                        </button>
                        <button v-for="section in [
                            { id: 'features', label: 'Features' },
                            { id: 'pricing', label: 'Pricing' },
                        ]" :key="section.id" type="button"
                            class="relative px-3 pb-1 pt-0.5 text-base font-semibold tracking-tight transition-colors"
                            :class="isActiveSection(section.id)
                                    ? 'text-neutral-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-neutral-950'
                                    : 'text-neutral-400 hover:text-neutral-600'
                                " @click="scrollToSection(section.id)">
                            {{ section.label }}
                        </button>

                        <NuxtLink v-for="link in [
                            { to: '/community', label: 'Community' },
                            { to: '/contact', label: 'Contact Us' },
                        ]" :key="link.to" :to="link.to"
                            class="relative px-3 pb-1 pt-0.5 text-base font-semibold tracking-tight transition-colors"
                            :class="isActiveNavPath(link.to)
                                    ? 'text-neutral-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-neutral-950'
                                    : 'text-neutral-400 hover:text-neutral-600'
                                ">
                            {{ link.label }}
                        </NuxtLink>
                    </nav>
                </div>

                <div class="flex items-center gap-3">
                    <!-- Install App button -->
                    <NuxtLink to="/install-app"
                        class="hidden rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium leading-tight text-neutral-700 transition-colors hover:bg-neutral-50 md:inline-flex md:items-center md:gap-1.5 md:justify-center">
                        <UIcon name="i-heroicons-arrow-down-tray-20-solid" class="size-3.75 shrink-0" />
                        Install App
                    </NuxtLink>

                    <!-- Auth-dependent UI is client-only to avoid SSR/CSR mismatch when the Supabase session differs between server and client. -->
                    <ClientOnly>
                        <!-- Authenticated: account menu (desktop header only) -->
                        <div v-if="user" class="relative hidden md:inline-flex">
                            <button type="button"
                                class="landing-profile-trigger inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium leading-snug text-neutral-800 transition-colors hover:bg-neutral-100 outline-none"
                                aria-label="Account menu" aria-haspopup="menu" :aria-expanded="isProfileDropdownOpen"
                                @click="isProfileDropdownOpen = !isProfileDropdownOpen">
                                <UIcon name="i-heroicons-user-20-solid" class="size-4 shrink-0 text-neutral-600"
                                    aria-hidden="true" />
                                <span class="max-w-35 truncate">{{ displayName }}</span>
                            </button>

                            <Transition enter-active-class="transition duration-100 ease-out"
                                leave-active-class="transition duration-75 ease-in"
                                enter-from-class="opacity-0 -translate-y-0.5"
                                leave-to-class="opacity-0 -translate-y-0.5">
                                <div v-if="isProfileDropdownOpen" ref="profileMenuRef"
                                    class="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)]"
                                    role="menu">
                                    <button type="button" role="menuitem"
                                        class="block w-full px-3 py-1.5 text-left text-[13px] leading-tight text-neutral-800 transition-colors hover:bg-neutral-50 outline-none"
                                        @click="handleLandingSettings">
                                        Settings
                                    </button>
                                    <div class="mx-3 my-1 h-px bg-neutral-100"></div>
                                    <button type="button" role="menuitem"
                                        class="block w-full px-3 py-1.5 text-left text-[13px] leading-tight text-red-600 transition-colors hover:bg-red-50/70 outline-none"
                                        @click="handleLandingSignOut">
                                        Sign out
                                    </button>
                                </div>
                            </Transition>
                        </div>

                        <!-- Signed-out: sign in button -->
                        <NuxtLink v-else to="/sign-in?redirect=/"
                            class="hidden rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium leading-tight text-white transition-opacity hover:opacity-90 md:inline-flex md:items-center md:justify-center">
                            Sign in
                        </NuxtLink>
                    </ClientOnly>

                    <button type="button"
                        class="flex size-9 items-center justify-center rounded-md transition-colors hover:bg-neutral-100 md:hidden"
                        aria-label="Toggle menu" @click="mobileOpen = !mobileOpen">
                        <svg v-if="!mobileOpen" class="size-5 text-neutral-700" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        <svg v-else class="size-5 text-neutral-700" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            <Transition enter-active-class="transition-all duration-200 ease-out"
                leave-active-class="transition-all duration-150 ease-in" enter-from-class="opacity-0 -translate-y-2"
                leave-to-class="opacity-0 -translate-y-2">
                <div v-if="mobileOpen"
                    class="border-t border-neutral-200/40 bg-white/95 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden">
                    <nav class="flex flex-col gap-1">
                        <button type="button"
                            class="rounded-md px-3 py-2 text-left text-base font-medium transition-colors hover:bg-neutral-50"
                            :class="isActiveHome()
                                    ? 'bg-neutral-100 font-semibold text-neutral-950'
                                    : 'text-neutral-600 hover:text-neutral-950'
                                " @click="scrollToHome">
                            Home
                        </button>
                        <button type="button"
                            class="rounded-md px-3 py-2 text-left text-base font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
                            @click="scrollToSection('features')">
                            Features
                        </button>
                        <button type="button"
                            class="rounded-md px-3 py-2 text-left text-base font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
                            @click="scrollToSection('pricing')">
                            Pricing
                        </button>
                        <NuxtLink to="/community"
                            class="rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-neutral-50"
                            :class="isActiveNavPath('/community')
                                    ? 'bg-neutral-100 font-semibold text-neutral-950'
                                    : 'text-neutral-600 hover:text-neutral-950'
                                ">
                            Community
                        </NuxtLink>
                        <NuxtLink to="/contact"
                            class="rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-neutral-50"
                            :class="isActiveNavPath('/contact')
                                    ? 'bg-neutral-100 font-semibold text-neutral-950'
                                    : 'text-neutral-600 hover:text-neutral-950'
                                ">
                            Contact Us
                        </NuxtLink>
                        <!-- Install App button -->
                        <NuxtLink to="/install-app"
                            class="inline-flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-base font-medium text-neutral-700 hover:bg-neutral-50"
                            @click="mobileOpen = false">
                            <UIcon name="i-heroicons-arrow-down-tray-20-solid" class="size-4 shrink-0" />
                            Install App
                        </NuxtLink>

                        <ClientOnly>
                            <!-- Authenticated: profile row -->
                            <NuxtLink v-if="user" to="/dashboard/settings"
                                class="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-neutral-50"
                                @click="mobileOpen = false">
                                <span v-if="avatarUrl" class="size-8 shrink-0 overflow-hidden rounded-full">
                                    <img :src="avatarUrl" :alt="displayName" class="size-full object-cover"
                                        referrerpolicy="no-referrer">
                                </span>
                                <span v-else
                                    class="btn-gradient flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                                    {{ initials }}
                                </span>
                                <span class="truncate text-base font-medium text-neutral-800">{{ displayName }}</span>
                            </NuxtLink>

                            <!-- Signed-out: sign in button -->
                            <NuxtLink v-else to="/sign-in?redirect=/"
                                class="inline-flex w-full items-center justify-center rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium leading-tight text-white transition-opacity hover:opacity-90">
                                Sign in
                            </NuxtLink>
                        </ClientOnly>
                    </nav>
                </div>
            </Transition>
        </header>

        <main class="flex w-full min-w-0 shrink-0 flex-col">
            <slot />
        </main>

        <footer class="border-t border-neutral-200 bg-neutral-50 pb-8 pt-16">
            <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                <div class="grid gap-12 lg:grid-cols-6">
                    <div class="lg:col-span-2">
                        <button type="button" class="cursor-pointer border-0 bg-transparent p-0 text-inherit"
                            aria-label="Home" @click="scrollToHome">
                            <InlineLogo size="xl" />
                        </button>
                        <p class="mt-4 max-w-xs text-sm leading-relaxed text-neutral-500">
                            Build, deploy, and manage intelligent AI agents that automate your
                            workflows.
                        </p>
                    </div>

                    <div class="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-4">
                        <div v-for="group in linkGroups" :key="group.title">
                            <h4 class="text-sm font-bold text-neutral-950">
                                {{ group.title }}
                            </h4>
                            <ul class="mt-4 space-y-3">
                                <li v-for="link in group.links" :key="link.label">
                                    <NuxtLink v-if="'to' in link" :to="link.to"
                                        class="text-sm text-neutral-500 transition-colors hover:text-neutral-700">
                                        {{ link.label }}
                                    </NuxtLink>
                                    <a v-else :href="link.href"
                                        class="text-sm text-neutral-500 transition-colors hover:text-neutral-700">
                                        {{ link.label }}
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div
                    class="mt-12 flex flex-col items-center justify-between gap-6 border-t border-neutral-200 pt-8 sm:flex-row">
                    <p class="text-sm text-neutral-500">
                        &copy; {{ new Date().getFullYear() }} Polymux. All rights reserved.
                    </p>

                    <div class="flex items-center gap-4">
                        <a href="#" class="text-neutral-400 transition-colors hover:text-neutral-600"
                            aria-label="LinkedIn">
                            <svg class="size-5" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                            </svg>
                        </a>

                        <a href="#" class="text-neutral-400 transition-colors hover:text-neutral-600" aria-label="X">
                            <svg class="size-5" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                        </a>

                        <a href="#" class="text-neutral-400 transition-colors hover:text-neutral-600"
                            aria-label="Instagram">
                            <svg class="size-5" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                            </svg>
                        </a>

                        <a href="#" class="text-neutral-400 transition-colors hover:text-neutral-600"
                            aria-label="YouTube">
                            <svg class="size-5" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                            </svg>
                        </a>

                        <a href="#" class="text-neutral-400 transition-colors hover:text-neutral-600"
                            aria-label="Facebook">
                            <svg class="size-5" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                        </a>

                        <a href="#" class="text-neutral-400 transition-colors hover:text-neutral-600"
                            aria-label="Reddit">
                            <svg class="size-5" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.462.342.342 0 00-.465 0c-.533.534-1.684.734-2.512.734-.828 0-1.979-.2-2.512-.734a.315.315 0 00-.202-.095z" />
                            </svg>
                        </a>

                        <a href="#" class="text-neutral-400 transition-colors hover:text-neutral-600"
                            aria-label="Discord">
                            <svg class="size-5" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    </div>
</template>
