<script setup lang="ts">
definePageMeta({ layout: 'landing' })

type Platform = 'macos' | 'windows' | 'linux' | 'unknown'

const APP_VERSION = '1.0.0'

interface DownloadVariant {
  label: string
  meta: string
  href: string
  primary?: boolean
}

interface DesktopPlatform {
  id: Exclude<Platform, 'unknown'>
  name: string
  icon: string
  tagline: string
  requirement: string
  primaryLabel: string
  primaryHref: string
  primaryMeta: string
  variants: DownloadVariant[]
}

const desktopPlatforms: DesktopPlatform[] = [
  {
    id: 'macos',
    name: 'macOS',
    icon: 'i-ph-apple-logo-fill',
    tagline: 'Universal build',
    requirement: 'macOS 12 Monterey or later',
    primaryLabel: 'Download for macOS',
    primaryHref: `/downloads/Polymux-${APP_VERSION}-universal.dmg`,
    primaryMeta: `Universal · .dmg · v${APP_VERSION}`,
    variants: [
      {
        label: 'Apple Silicon',
        meta: '.dmg · arm64',
        href: `/downloads/Polymux-${APP_VERSION}-arm64.dmg`,
      },
      {
        label: 'Intel',
        meta: '.dmg · x64',
        href: `/downloads/Polymux-${APP_VERSION}-x64.dmg`,
      },
      {
        label: 'Homebrew',
        meta: 'brew install --cask polymux',
        href: 'https://brew.sh',
      },
    ],
  },
  {
    id: 'windows',
    name: 'Windows',
    icon: 'i-ph-windows-logo-fill',
    tagline: 'x64 & ARM64',
    requirement: 'Windows 10 or later',
    primaryLabel: 'Download for Windows',
    primaryHref: `/downloads/Polymux-Setup-${APP_VERSION}.exe`,
    primaryMeta: `Installer · .exe · v${APP_VERSION}`,
    variants: [
      {
        label: 'MSI installer',
        meta: '.msi · x64',
        href: `/downloads/Polymux-${APP_VERSION}-x64.msi`,
      },
      {
        label: 'Portable (ZIP)',
        meta: '.zip · x64',
        href: `/downloads/Polymux-${APP_VERSION}-win-x64.zip`,
      },
      {
        label: 'Winget',
        meta: 'winget install Polymux.Polymux',
        href: 'https://learn.microsoft.com/en-us/windows/package-manager/',
      },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    icon: 'i-ph-linux-logo-fill',
    tagline: 'Most major distros',
    requirement: 'glibc 2.31+ · x86_64 / aarch64',
    primaryLabel: 'Download for Linux',
    primaryHref: `/downloads/Polymux-${APP_VERSION}.AppImage`,
    primaryMeta: `AppImage · x64 · v${APP_VERSION}`,
    variants: [
      {
        label: 'Debian / Ubuntu',
        meta: '.deb · x64',
        href: `/downloads/polymux_${APP_VERSION}_amd64.deb`,
      },
      {
        label: 'Fedora / RHEL',
        meta: '.rpm · x64',
        href: `/downloads/polymux-${APP_VERSION}.x86_64.rpm`,
      },
      {
        label: 'Snap',
        meta: 'sudo snap install polymux',
        href: 'https://snapcraft.io',
      },
    ],
  },
]

const detected = ref<Platform>('unknown')

function detectPlatform(): Platform {
  if (!import.meta.client) return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  if (/mac|iphone|ipad|ipod/.test(ua) || /mac|iphone|ipad|ipod/.test(platform)) return 'macos'
  if (/win/.test(ua) || /win/.test(platform)) return 'windows'
  if (/linux|x11|cros/.test(ua) || /linux/.test(platform)) return 'linux'
  return 'unknown'
}

onMounted(() => {
  detected.value = detectPlatform()
})

const detectedPlatform = computed(() =>
  desktopPlatforms.find((p) => p.id === detected.value) ?? null,
)

const detectedPlatformName = computed(() =>
  detectedPlatform.value?.name ?? 'your computer',
)

function scrollToManual() {
  if (!import.meta.client) return
  document.getElementById('manual-install')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

const mobilePlatforms = [
  {
    id: 'ios',
    name: 'iOS',
    icon: 'i-ph-apple-logo-fill',
    description: 'Bring Polymux to iPhone and iPad. Follow sessions and review agent work on the go.',
  },
  {
    id: 'android',
    name: 'Android',
    icon: 'i-ph-android-logo-fill',
    description: 'A native Android companion for monitoring workflows and approving agent actions anywhere.',
  },
]

const reassurance = [
  { icon: 'i-heroicons-shield-check-20-solid', label: 'Signed & notarised' },
  { icon: 'i-heroicons-arrow-path-20-solid', label: 'Auto-updates' },
  { icon: 'i-heroicons-sparkles-20-solid', label: 'Free to download' },
  { icon: 'i-heroicons-lock-closed-20-solid', label: 'Private by default' },
]
</script>

<template>
  <div class="flex w-full flex-col items-center">
    <!-- Hero -->
    <section class="w-full px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
      <div class="mx-auto max-w-3xl text-center">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600"
        >
          <span class="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Polymux for desktop · v{{ APP_VERSION }}
        </span>
        <h1
          class="mt-6 font-serif text-[2.75rem] leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl"
        >
          Install Polymux
        </h1>
        <p class="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-neutral-600">
          A quiet, native home for your AI agents. One fast, focused app —
          across macOS, Windows, and Linux.
        </p>

        <!-- Primary download CTA -->
        <div class="mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-3">
          <template v-if="detectedPlatform">
            <a
              :href="detectedPlatform.primaryHref"
              class="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-neutral-950 px-6 py-4 text-base font-medium text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md"
            >
              <UIcon
                :name="detectedPlatform.icon"
                class="size-5 shrink-0"
                aria-hidden="true"
              />
              {{ detectedPlatform.primaryLabel }}
            </a>
            <p class="text-xs text-neutral-500">
              Detected {{ detectedPlatformName }} · {{ detectedPlatform.primaryMeta }}
            </p>
          </template>
          <template v-else>
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-neutral-950 px-6 py-4 text-base font-medium text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md"
              @click="scrollToManual"
            >
              <UIcon name="i-heroicons-arrow-down-tray-20-solid" class="size-5 shrink-0" />
              Download Polymux
            </button>
            <p class="text-xs text-neutral-500">
              Choose your platform below
            </p>
          </template>

          <button
            type="button"
            class="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800"
            @click="scrollToManual"
          >
            Not {{ detectedPlatformName }}? See all downloads
            <UIcon name="i-heroicons-arrow-down-20-solid" class="size-4" />
          </button>
        </div>

        <!-- Reassurance strip -->
        <dl class="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-y-4 text-left sm:grid-cols-4 sm:gap-y-0">
          <div
            v-for="item in reassurance"
            :key="item.label"
            class="flex items-center justify-center gap-2 text-sm text-neutral-600"
          >
            <UIcon :name="item.icon" class="size-4 text-neutral-400" aria-hidden="true" />
            <dt class="sr-only">
              Feature
            </dt>
            <dd>{{ item.label }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <!-- Manual installation -->
    <section
      id="manual-install"
      class="w-full scroll-mt-20 bg-[#F9F9F9] px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
    >
      <div class="mx-auto max-w-6xl">
        <div class="mx-auto max-w-2xl text-center">
          <span class="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Manual installation
          </span>
          <h2 class="mt-3 font-serif text-3xl tracking-tight text-neutral-950 sm:text-4xl">
            Pick your platform
          </h2>
          <p class="mx-auto mt-4 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
            Every build is signed, notarised, and ships with the same features.
            Download the variant that fits your setup.
          </p>
        </div>

        <div class="mt-14 grid gap-6 lg:grid-cols-3">
          <article
            v-for="platform in desktopPlatforms"
            :key="platform.id"
            class="flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-7 transition-shadow hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(26,28,28,0.06)]"
            :class="{
              'ring-1 ring-neutral-950/90 ring-offset-2 ring-offset-[#F9F9F9]':
                detected === platform.id,
            }"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex size-11 items-center justify-center rounded-xl bg-neutral-950 text-white">
                <UIcon :name="platform.icon" class="size-6" aria-hidden="true" />
              </div>
              <span
                v-if="detected === platform.id"
                class="inline-flex items-center gap-1 rounded-full bg-neutral-950 px-2.5 py-1 text-xs font-medium text-white"
              >
                <UIcon name="i-heroicons-check-20-solid" class="size-3.5" />
                Your system
              </span>
            </div>

            <h3 class="mt-5 text-xl font-semibold tracking-tight text-neutral-950">
              {{ platform.name }}
            </h3>
            <p class="mt-1 text-sm text-neutral-500">
              {{ platform.tagline }} · {{ platform.requirement }}
            </p>

            <a
              :href="platform.primaryHref"
              class="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <UIcon name="i-heroicons-arrow-down-tray-20-solid" class="size-4 shrink-0" />
              {{ platform.primaryLabel }}
            </a>
            <p class="mt-2 text-center text-xs text-neutral-500">
              {{ platform.primaryMeta }}
            </p>

            <div class="mt-6 border-t border-neutral-200/70 pt-5">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Other options
              </p>
              <ul class="mt-3 flex flex-col gap-1">
                <li v-for="variant in platform.variants" :key="variant.label">
                  <a
                    :href="variant.href"
                    class="group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-neutral-100"
                  >
                    <span class="flex flex-col">
                      <span class="font-medium text-neutral-900">
                        {{ variant.label }}
                      </span>
                      <span class="font-mono text-xs text-neutral-500">
                        {{ variant.meta }}
                      </span>
                    </span>
                    <UIcon
                      name="i-heroicons-arrow-up-right-20-solid"
                      class="size-4 shrink-0 text-neutral-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-neutral-700"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Mobile — coming soon -->
    <section class="w-full px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <div class="mx-auto max-w-2xl text-center">
          <span class="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            On the way
          </span>
          <h2 class="mt-3 font-serif text-3xl tracking-tight text-neutral-950 sm:text-4xl">
            Mobile apps
          </h2>
          <p class="mx-auto mt-4 max-w-lg text-[1.0625rem] leading-relaxed text-neutral-600">
            Native companion apps are in development. Check in on agents,
            approve actions, and stay close to your workflows from anywhere.
          </p>
        </div>

        <div class="mt-12 grid gap-6 sm:grid-cols-2">
          <div
            v-for="mobile in mobilePlatforms"
            :key="mobile.id"
            class="relative overflow-hidden rounded-2xl border border-dashed border-neutral-300/80 bg-white/40 p-8"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex size-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                <UIcon :name="mobile.icon" class="size-6" aria-hidden="true" />
              </div>
              <span class="inline-flex items-center rounded-full bg-neutral-200/80 px-2.5 py-1 text-xs font-medium text-neutral-700">
                Coming soon
              </span>
            </div>
            <h3 class="mt-6 text-lg font-semibold tracking-tight text-neutral-950">
              Polymux for {{ mobile.name }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-neutral-600">
              {{ mobile.description }}
            </p>
            <div class="mt-6 flex items-center gap-2 text-sm text-neutral-400">
              <UIcon name="i-heroicons-bell-alert-20-solid" class="size-4" />
              <NuxtLink to="/contact" class="underline-offset-2 hover:text-neutral-700 hover:underline">
                Get notified when it launches
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer help strip -->
    <section class="w-full border-t border-neutral-200 bg-white px-4 py-14 sm:px-6 lg:px-8">
      <div class="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center">
        <h3 class="font-serif text-2xl tracking-tight text-neutral-950">
          Need help installing?
        </h3>
        <p class="max-w-md text-sm leading-relaxed text-neutral-600">
          Our docs walk through verification, updates, and troubleshooting for
          every platform.
        </p>
        <div class="mt-2 flex flex-wrap items-center justify-center gap-3">
          <NuxtLink
            to="/development"
            class="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
          >
            <UIcon name="i-heroicons-code-bracket-square-20-solid" class="size-4" />
            Developer platform
          </NuxtLink>
          <NuxtLink
            to="/contact"
            class="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-950"
          >
            Contact support
            <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
