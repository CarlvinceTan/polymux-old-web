<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const { t, locale, setLocale } = useI18n()

const props = defineProps<{
  userEmail: string
  userName: string
  userPlan: string
  isOpen: boolean
}>()

const emit = defineEmits<{
  'update:isOpen': [boolean]
  'settings': []
  'upgrade': []
  'download': []
  'logout': []
}>()

const dropdownRef = ref<HTMLElement | null>(null)
const activeSubmenu = ref<'language' | 'help' | null>(null)

const isLanguageMenuOpen = computed(() => activeSubmenu.value === 'language')
const isHelpMenuOpen = computed(() => activeSubmenu.value === 'help')

const languages = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
]

const helpLinks = computed(() => {
  locale.value
  return [
    { label: t('common.termsAndConditions'), href: '/legal/terms' },
    { label: t('common.privacyPolicy'), href: '/legal/privacy' },
    { label: t('common.cookiesPolicy'), href: '/legal/cookies' },
    { label: t('common.reportBug'), href: '#', action: 'bug-report' },
  ]
})
const currentLanguage = computed(() => {
  const lang = languages.find(l => l.code === locale.value)
  return lang?.name || 'English'
})

function openLanguageMenu() {
  activeSubmenu.value = 'language'
}

function openHelpMenu() {
  activeSubmenu.value = 'help'
}

function selectLanguage(code: string) {
  void setLocale(code as typeof locale.value)
  activeSubmenu.value = null
}

function closeMenu() {
  emit('update:isOpen', false)
  activeSubmenu.value = null
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    closeMenu()
  }
}

onMounted(() => {
  if (props.isOpen) {
    document.addEventListener('click', handleClickOutside)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
    activeSubmenu.value = null
  }
})
</script>

<template>
  <div v-if="isOpen" ref="dropdownRef"
    class="absolute bottom-full mb-1 right-0 w-64 rounded-xl bg-white border border-neutral-200 shadow-lg ring-1 ring-neutral-200 overflow-hidden z-50">
    <!-- User Info Section -->
    <div class="px-4 py-3 border-b border-neutral-200">
      <p class="text-xs font-medium text-neutral-500 truncate">{{ userEmail }}</p>
    </div>

    <!-- Main Menu Section -->
    <div v-if="!isLanguageMenuOpen && !isHelpMenuOpen" class="py-1">
      <!-- Settings -->
      <NuxtLink to="/config"
        @click="closeMenu"
        class="flex items-center gap-3 px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer">
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.549 2C11.35 2 12 2.65 12 3.451c0 .195.138.403.385.501q.102.041.204.085l.09.032c.212.06.415.007.536-.114a1.453 1.453 0 0 1 2.055.001l.774.774.1.11a1.454 1.454 0 0 1-.1 1.945c-.138.138-.187.382-.081.625l.085.205.042.087c.108.192.289.298.459.298C17.35 8 18 8.65 18 9.451v1.098C18 11.35 17.35 12 16.549 12c-.17 0-.35.106-.46.298l-.041.087-.085.204c-.106.243-.057.488.08.626a1.453 1.453 0 0 1 0 2.055l-.773.774a1.453 1.453 0 0 1-2.055 0 .55.55 0 0 0-.535-.114l-.091.033q-.1.044-.203.084c-.247.098-.386.306-.386.5C12 17.35 11.35 18 10.548 18H9.452C8.65 18 8 17.35 8 16.548a.55.55 0 0 0-.298-.46l-.087-.041-.205-.085c-.243-.106-.487-.056-.625.082a1.453 1.453 0 0 1-1.944.1l-.11-.1-.775-.774a1.453 1.453 0 0 1 0-2.055l.047-.057a.56.56 0 0 0 .066-.478l-.032-.091-.085-.204c-.098-.247-.306-.385-.5-.385C2.65 12 2 11.35 2 10.549V9.45C2 8.65 2.65 8 3.451 8c.195 0 .402-.138.5-.385l.086-.205.032-.09a.56.56 0 0 0-.066-.48l-.048-.055a1.453 1.453 0 0 1 0-2.055l.775-.775.11-.1a1.453 1.453 0 0 1 1.945.1c.138.138.382.188.625.082q.102-.045.205-.086c.247-.098.385-.305.385-.5C8 2.65 8.65 2 9.451 2zM9.45 3a.45.45 0 0 0-.45.451c0 .674-.457 1.21-1.017 1.43l-.173.072c-.554.241-1.256.187-1.733-.29a.45.45 0 0 0-.568-.059l-.07.06-.776.774a.45.45 0 0 0 0 .64c.447.446.523 1.091.332 1.626l-.042.106-.071.173C4.66 8.543 4.125 9 3.452 9A.45.45 0 0 0 3 9.451v1.098c0 .249.202.451.451.451.674 0 1.209.457 1.43 1.017l.072.172c.242.553.187 1.256-.29 1.733a.453.453 0 0 0 0 .64l.774.775.072.059a.45.45 0 0 0 .568-.06c.477-.476 1.18-.532 1.734-.29q.085.037.172.071l.104.046c.511.244.913.753.913 1.385 0 .25.203.452.452.452h1.096c.25 0 .452-.203.452-.452 0-.674.457-1.209 1.017-1.43l.172-.072.105-.042c.535-.191 1.18-.114 1.628.333a.453.453 0 0 0 .64 0l.775-.774a.453.453 0 0 0 0-.641c-.477-.477-.532-1.18-.29-1.734q.037-.085.071-.172l.046-.104c.244-.51.754-.912 1.385-.912a.45.45 0 0 0 .451-.451V9.45a.45.45 0 0 0-.451-.45c-.632 0-1.14-.402-1.385-.913l-.046-.104-.072-.172c-.242-.554-.186-1.257.29-1.734a.45.45 0 0 0 .06-.568l-.06-.072-.774-.774a.454.454 0 0 0-.569-.059l-.071.06c-.477.476-1.18.53-1.734.29l-.171-.072C11.457 4.66 11 4.125 11 3.452A.45.45 0 0 0 10.549 3zM10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 1a2 2 0 1 0 0 4 2 2 0 0 0 0-4"></path>
        </svg>
        <span>{{ t('common.settings') }}</span>
      </NuxtLink>

      <!-- Language -->
      <button @click="openLanguageMenu"
        class="w-full flex items-center justify-between px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7.27 3.05a7.467 7.467 0 1 1-.018.007l.01-.004zm1.372 11.478a8 8 0 0 0-1.464 1.362 6.53 6.53 0 0 0 3.373.62 6.2 6.2 0 0 1-.969-.835 10 10 0 0 1-.94-1.147m4.515-1.993c-.626.13-1.275.323-1.93.581-.654.258-1.26.56-1.808.892.276.386.555.73.835 1.02.45.468.88.788 1.258.958.376.17.665.178.881.093.218-.085.425-.289.584-.67.16-.383.257-.91.267-1.558a9 9 0 0 0-.087-1.316M3.637 8.52a6.5 6.5 0 0 0 .285 3.876 6.5 6.5 0 0 0 2.433 3.027 9 9 0 0 1 1.772-1.674 16.4 16.4 0 0 1-1.243-2.52 16.5 16.5 0 0 1-.81-2.693 9 9 0 0 1-2.436-.016m12.444 3.864a8 8 0 0 0-2 .003c.07.523.103 1.02.096 1.48a6.2 6.2 0 0 1-.14 1.272 6.53 6.53 0 0 0 2.044-2.755M11.095 6.77c-.607.37-1.271.701-1.98.981s-1.423.49-2.119.633c.165.79.417 1.638.757 2.5s.733 1.653 1.151 2.344c.607-.37 1.272-.701 1.982-.981s1.422-.49 2.117-.634a15.6 15.6 0 0 0-.756-2.499 15.6 15.6 0 0 0-1.152-2.344m2.548-2.194a9 9 0 0 1-1.77 1.674c.457.751.881 1.602 1.243 2.521.362.92.633 1.83.81 2.692a9 9 0 0 1 2.435.016 6.5 6.5 0 0 0-.282-3.875 6.5 6.5 0 0 0-2.436-3.028m-7.681.286a6.53 6.53 0 0 0-2.044 2.753c.603.08 1.279.082 1.999-.002-.07-.523-.1-1.02-.094-1.48a6.2 6.2 0 0 1 .139-1.27m2.526-.85c-.376-.17-.665-.177-.883-.091s-.423.288-.583.669c-.16.383-.256.91-.266 1.557a9 9 0 0 0 .086 1.316c.627-.13 1.276-.321 1.93-.58.655-.257 1.26-.561 1.807-.893a9 9 0 0 0-.833-1.02c-.45-.468-.88-.787-1.258-.957m4.334.096a6.53 6.53 0 0 0-3.372-.62c.328.224.654.506.969.834q.48.5.94 1.147a8 8 0 0 0 1.464-1.362"></path>
          </svg>
          <span>{{ t('common.language') }}</span>
        </div>
        <svg class="w-4 h-4 text-neutral-400" viewBox="0 0 256 256" fill="currentColor">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
        </svg>
      </button>

      <!-- Upgrade Plan -->
      <NuxtLink to="/pricing"
        @click="closeMenu"
        class="flex items-center gap-3 px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer">
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15m0 1a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13m-.354 3.146a.5.5 0 0 1 .63-.064l.078.064 2.5 2.5a.5.5 0 1 1-.707.708L10.5 8.207V13l-.01.1a.5.5 0 0 1-.98 0L9.5 13V8.207L7.854 9.854a.5.5 0 0 1-.707-.708z"></path>
        </svg>
        <span>{{ t('common.upgradePlan') }}</span>
      </NuxtLink>

      <!-- Install App -->
      <NuxtLink to="/install-app"
        @click="closeMenu"
        class="flex items-center gap-3 px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors cursor-pointer">
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path d="M16.5 13a.5.5 0 0 1 .5.5v2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-2a.5.5 0 0 1 1 0v2a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 1 .5-.5M10 3a.5.5 0 0 1 .5.5v8.686l3.126-3.518a.5.5 0 0 1 .748.664l-4 4.5-.08.071a.5.5 0 0 1-.668-.071l-4-4.5-.059-.082A.5.5 0 0 1 6.3 8.6l.075.068L9.5 12.186V3.5A.5.5 0 0 1 10 3"></path>
        </svg>
        <span>{{ t('common.downloadApps') }}</span>
      </NuxtLink>

      <!-- Help -->
      <button @click="openHelpMenu"
        class="w-full flex items-center justify-between px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15m0 1a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13m0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5m0-7a2.5 2.5 0 0 1 1.34 4.61l-.14.084a1.9 1.9 0 0 0-.522.402c-.126.146-.178.28-.178.404v.25a.5.5 0 0 1-1 0v-.25c0-.428.185-.784.418-1.056.23-.268.525-.475.8-.627l.169-.107A1.5 1.5 0 1 0 8.5 8.5a.5.5 0 0 1-1 0A2.5 2.5 0 0 1 10 6"></path>
          </svg>
          <span>{{ t('common.help') }}</span>
        </div>
        <svg class="w-4 h-4 text-neutral-400" viewBox="0 0 256 256" fill="currentColor">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
        </svg>
      </button>

      <div class="my-1 h-px bg-neutral-200"></div>

      <!-- Sign Out -->
      <button @click="emit('logout'); closeMenu()"
        class="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors">
        <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.5 3A1.5 1.5 0 0 1 11 4.5v3l-.01.1a.5.5 0 0 1-.98 0L10 7.5v-3a.5.5 0 0 0-.5-.5h-5l-.1.01a.5.5 0 0 0-.4.49v11a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .49-.4l.01-.1v-3a.5.5 0 0 1 1 0v3l-.008.153A1.5 1.5 0 0 1 9.5 17h-5A1.5 1.5 0 0 1 3 15.5v-11a1.5 1.5 0 0 1 1.347-1.492L4.5 3zm3.12 3.675a.5.5 0 0 1 .705-.055l3.5 3 .074.08a.5.5 0 0 1-.074.68l-3.5 3-.083.057a.5.5 0 0 1-.638-.744l.07-.073 2.474-2.12H7.5a.5.5 0 0 1 0-1h7.648l-2.473-2.12a.5.5 0 0 1-.055-.705"></path>
        </svg>
        <span>{{ t('common.signOut') }}</span>
      </button>
    </div>

    <!-- Language Submenu -->
    <div v-if="isLanguageMenuOpen" class="py-1">
      <button @click="activeSubmenu.value = null"
        class="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 transition-colors border-b border-neutral-200">
        <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
          <path d="M224 128a8 8 0 0 1-8 8H59.31l58.35 58.34a8 8 0 0 1-11.32 11.32l-72-72a8 8 0 0 1 0-11.32l72-72a8 8 0 0 1 11.32 11.32L59.31 120H216a8 8 0 0 1 8 8"></path>
        </svg>
        <span>{{ t('common.language') }}</span>
      </button>
      <div class="max-h-48 overflow-y-auto">
        <button v-for="lang in languages" :key="lang.code"
          @click="selectLanguage(lang.code)"
          class="w-full flex items-center justify-between px-4 py-2 text-sm transition-colors"
          :class="locale === lang.code
            ? 'bg-neutral-100 text-neutral-950 font-medium'
            : 'text-neutral-950 hover:bg-neutral-50'">
          <span>{{ lang.name }}</span>
          <svg v-if="locale === lang.code" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
            <path d="m205.66 85.66-120 120a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L80 188.69l114.34-114.35a8 8 0 0 1 11.32 11.32"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Help Submenu -->
    <div v-if="isHelpMenuOpen" class="py-1">
      <button @click="activeSubmenu.value = null"
        class="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100 transition-colors border-b border-neutral-200">
        <svg class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
          <path d="M224 128a8 8 0 0 1-8 8H59.31l58.35 58.34a8 8 0 0 1-11.32 11.32l-72-72a8 8 0 0 1 0-11.32l72-72a8 8 0 0 1 11.32 11.32L59.31 120H216a8 8 0 0 1 8 8"></path>
        </svg>
        <span>{{ t('common.help') }}</span>
      </button>
      <div class="max-h-48 overflow-y-auto">
        <NuxtLink v-for="link in helpLinks" :key="link.href"
          :to="link.href"
          @click="closeMenu"
          class="block px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-100 transition-colors">
          {{ link.label }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
