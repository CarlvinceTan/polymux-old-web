<script setup lang="ts">
definePageMeta({ layout: 'landing' })

useHead({
  title: 'Install Apps',
  meta: [
    {
      name: 'description',
      content: 'Download Polymux native apps for macOS, Windows, and Linux. Run AI agents locally with full system integration.',
    },
  ],
})

const { t } = useI18n()

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
  variants: DownloadVariant[]
  primaryHref: string
  primaryMeta: string
}

const desktopPlatforms: DesktopPlatform[] = [
  {
    id: 'macos',
    name: 'macOS',
    icon: 'i-simple-icons-apple',
    primaryHref: `/downloads/Polymux-${APP_VERSION}-universal.dmg`,
    primaryMeta: `Universal · .dmg · v${APP_VERSION}`,
    variants: [
      { label: 'Apple Silicon', meta: '.dmg · arm64', href: `/downloads/Polymux-${APP_VERSION}-arm64.dmg` },
      { label: 'Intel', meta: '.dmg · x64', href: `/downloads/Polymux-${APP_VERSION}-x64.dmg` },
      { label: 'Homebrew', meta: 'brew install --cask polymux', href: 'https://brew.sh' },
    ],
  },
  {
    id: 'windows',
    name: 'Windows',
    icon: 'i-simple-icons-windows11',
    primaryHref: `/downloads/Polymux-Setup-${APP_VERSION}.exe`,
    primaryMeta: `Installer · .exe · v${APP_VERSION}`,
    variants: [
      { label: 'MSI installer', meta: '.msi · x64', href: `/downloads/Polymux-${APP_VERSION}-x64.msi` },
      { label: 'Portable (ZIP)', meta: '.zip · x64', href: `/downloads/Polymux-${APP_VERSION}-win-x64.zip` },
      { label: 'Winget', meta: 'winget install Polymux.Polymux', href: 'https://learn.microsoft.com/en-us/windows/package-manager/' },
    ],
  },
  {
    id: 'linux',
    name: 'Linux',
    icon: 'i-simple-icons-linux',
    primaryHref: `/downloads/Polymux-${APP_VERSION}.AppImage`,
    primaryMeta: `AppImage · x64 · v${APP_VERSION}`,
    variants: [
      { label: 'Debian / Ubuntu', meta: '.deb · x64', href: `/downloads/polymux_${APP_VERSION}_amd64.deb` },
      { label: 'Fedora / RHEL', meta: '.rpm · x64', href: `/downloads/polymux-${APP_VERSION}.x86_64.rpm` },
      { label: 'Snap', meta: 'sudo snap install polymux', href: 'https://snapcraft.io' },
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
  detectedPlatform.value?.name ?? t('install.yourComputer'),
)

function scrollToExtensions() {
  if (!import.meta.client) return
  document.getElementById('extensions-mobile')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

const mobilePlatforms = [
  { id: 'ios', name: 'iOS', icon: 'i-simple-icons-apple', descKey: 'install.mobile.ios' },
  { id: 'android', name: 'Android', icon: 'i-simple-icons-android', descKey: 'install.mobile.android' },
]
</script>

<template>
  <div class="flex w-full flex-col items-center">
    <!-- Hero Header -->
    <section class="w-full px-4 pt-16 pb-16 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
      <div class="mx-auto max-w-3xl text-center">
        <h1 class="mt-6 font-serif text-[2.75rem] leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl">
          {{ t('install.heading') }}
        </h1>
        <p class="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-neutral-600">
          {{ t('install.subtitle') }}
        </p>

        <!-- Primary CTA -->
        <div class="mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-3">
          <template v-if="detectedPlatform">
            <button
              disabled
              class="group inline-flex w-full h-[3.5rem] items-center justify-center gap-2.5 rounded-xl bg-neutral-950/50 px-6 text-base leading-none font-medium text-white shadow-sm cursor-not-allowed"
            >
              <UIcon
                :name="detectedPlatform.icon"
                class="size-5 shrink-0"
                aria-hidden="true"
              />
              <span class="mt-[1px]">{{ t('install.mobile.comingSoon') }} for {{ detectedPlatformName }}</span>
            </button>
          </template>
          <template v-else>
            <button
              disabled
              class="inline-flex w-full h-[3.5rem] items-center justify-center gap-2.5 rounded-xl bg-neutral-950/50 px-6 text-base leading-none font-medium text-white shadow-sm cursor-not-allowed"
            >
              <UIcon name="i-heroicons-clock-20-solid" class="size-5 shrink-0" />
              <span class="mt-[1px]">Desktop Apps Coming Soon</span>
            </button>
          </template>

          <div class="mt-1 flex items-center justify-center gap-1 text-xs text-neutral-500">
            <span v-if="detected !== 'unknown'">Also available for</span>
            <span v-else>Available for</span>
            <template v-for="(p, index) in desktopPlatforms.filter(p => p.id !== detected)" :key="p.id">
              <button
                type="button"
                class="font-medium text-neutral-600 hover:text-neutral-900 transition-colors underline decoration-neutral-300 underline-offset-4"
                @click="detected = p.id"
              >
                {{ p.name }}
              </button>
              <span v-if="index < desktopPlatforms.filter(p => p.id !== detected).length - 1" class="text-neutral-500">and</span>
            </template>
          </div>

          <button
            type="button"
            class="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-700"
            @click="scrollToExtensions"
          >
            Looking for Mobile & Extensions?
            <UIcon name="i-heroicons-arrow-down-20-solid" class="size-4" />
          </button>
        </div>
      </div>
    </section>

    <!-- Browser Extension & Mobile Apps Section -->
    <section id="extensions-mobile" class="w-full bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 border-t border-neutral-200/50">
      <div class="mx-auto max-w-6xl">
        <div class="mb-14 text-center">
          <h2 class="font-serif text-3xl tracking-tight text-neutral-950 sm:text-4xl">
            Browser Extension & Mobile Apps
          </h2>
          <p class="mt-4 text-[1.0625rem] text-neutral-600">
            Take your workflows further. Add the extension to connect your browser, and get notified when mobile apps launch.
          </p>
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <!-- Browser Extension -->
          <div class="relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-[#F9F9F9] p-6 sm:p-8 flex flex-col items-start shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div class="flex size-12 items-center justify-center rounded-xl bg-white text-neutral-950 shadow-sm border border-neutral-200/80">
              <UIcon name="i-heroicons-puzzle-piece-20-solid" class="size-5 text-neutral-950" />
            </div>
            <span class="mt-6 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              {{ t('install.extension.eyebrow') }}
            </span>
            <h3 class="mt-2 font-serif text-xl tracking-tight text-neutral-950">
              {{ t('install.extension.heading') }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-neutral-600">
              {{ t('install.extension.subtitle') }}
            </p>
            <div class="mt-6 mt-auto pt-4">
              <button disabled class="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-500 cursor-not-allowed">
                <UIcon name="i-simple-icons-googlechrome" class="size-4" />
                {{ t('install.mobile.comingSoon') }}
              </button>
            </div>
          </div>

          <!-- Mobile Apps -->
          <div class="relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-[#F9F9F9] p-6 sm:p-8 flex flex-col shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span class="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              {{ t('install.mobile.eyebrow') }}
            </span>
            <h3 class="mt-2 font-serif text-xl tracking-tight text-neutral-950">
              {{ t('install.mobile.heading') }}
            </h3>
            <p class="mt-2 text-sm leading-relaxed text-neutral-600 mb-6">
              {{ t('install.mobile.subtitle') }}
            </p>

            <div class="grid gap-3 mt-auto">
              <div
                v-for="mobile in mobilePlatforms"
                :key="mobile.id"
                class="relative rounded-2xl border border-dashed border-neutral-300/80 bg-white p-5 flex flex-col gap-3"
              >
                <div class="flex items-center justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <div class="flex size-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                      <UIcon :name="mobile.icon" class="size-4" aria-hidden="true" />
                    </div>
                    <span class="font-semibold text-neutral-950 text-sm">
                      {{ t('install.mobile.polymuxFor', { name: mobile.name }) }}
                    </span>
                  </div>
                  <span class="inline-flex items-center rounded-full bg-neutral-200/80 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-neutral-700">
                    {{ t('install.mobile.comingSoon') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer help strip -->
    <section class="w-full border-t border-neutral-200 bg-white px-4 py-14 sm:px-6 lg:px-8">
      <div class="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center">
        <h3 class="font-serif text-2xl tracking-tight text-neutral-950">
          {{ t('install.help.heading') }}
        </h3>
        <p class="max-w-md text-sm leading-relaxed text-neutral-600">
          {{ t('install.help.description') }}
        </p>
        <div class="mt-2 flex flex-wrap items-center justify-center gap-3">
          <NuxtLink
            to="/documentation"
            class="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
          >
            <UIcon name="i-heroicons-book-open-20-solid" class="size-4" />
            {{ t('install.help.readGuide') }}
          </NuxtLink>
          <NuxtLink
            to="/contact"
            class="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-950"
          >
            {{ t('install.help.contactSupport') }}
            <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
