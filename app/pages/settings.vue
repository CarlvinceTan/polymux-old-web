<script setup lang="ts">
import { marked } from 'marked'

const { t, locale, locales, setLocale } = useI18n()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()

const isGuest = computed(() => !user.value)

const showCheckoutSuccess = ref(false)

onMounted(() => {
  if (route.query.checkout === 'success') {
    showCheckoutSuccess.value = true
    router.replace({ path: route.path, query: {} })
    setTimeout(() => { showCheckoutSuccess.value = false }, 5000)
  }
})

const displayName = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.full_name as string | undefined)
    || (meta?.name as string | undefined)
    || user.value?.email?.split('@')[0]
    || ''
})

const email = computed(() => user.value?.email || '')

const isEmailAuth = computed(() => {
  return user.value?.app_metadata?.provider === 'email'
})

const usedRequests = 4700
const limitRequests = 10_000

const usagePercent = computed(() =>
  Math.min(100, Math.round((usedRequests / limitRequests) * 100)),
)

const avatarUrl = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.avatar_url as string | undefined)
    || (meta?.picture as string | undefined)
    || null
})

const avatarError = ref(false)

watch(avatarUrl, () => { avatarError.value = false })

const initials = computed(() => {
  const name = displayName.value.trim() || 'U'
  return name
    .split(/\s+/)
    .map((n: string) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
})

function formatCount(n: number) {
  return n.toLocaleString(locale.value)
}

async function onLogOut() {
  await supabase.auth.signOut()
  router.push('/')
}

const editingProfile = ref(false)
const editName = ref('')
const editEmail = ref('')
const profileSaving = ref(false)
const profileError = ref('')

function startEditProfile() {
  editName.value = displayName.value
  editEmail.value = email.value
  profileError.value = ''
  editingProfile.value = true
}

function cancelEditProfile() {
  editingProfile.value = false
  profileError.value = ''
}

async function saveProfile() {
  profileSaving.value = true
  profileError.value = ''
  try {
    const updates: { email?: string; data?: Record<string, unknown> } = {
      data: { full_name: editName.value.trim() },
    }
    if (isEmailAuth.value && editEmail.value.trim() !== email.value) {
      updates.email = editEmail.value.trim()
    }
    const { error } = await supabase.auth.updateUser(updates)
    if (error) throw error
    editingProfile.value = false
  }
  catch (err: unknown) {
    profileError.value = err instanceof Error ? err.message : t('settings.profileUpdateError')
  }
  finally {
    profileSaving.value = false
  }
}

const { settings: userSettings, saving: blogSubscriptionSaving, fetchSettings } = useUserSettings()

onMounted(async () => {
  // Force a fresh fetch from Supabase so the toggle always reflects the live value.
  if (user.value) {
    await fetchSettings(true)
  }
})

const languageOptions = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map(l => ({
    value: l.code,
    label: l.name,
  })),
)

function changeLocale(code: string) {
  void setLocale(code as typeof locale.value)
}

const emailNotif = ref(true)
const pushNotif = ref(false)
const productUpdates = ref(true)
const responseCompletions = ref(true)

async function saveBlogSubscription(value: boolean) {
  try {
    await useUserSettings().saveSettings({ blog_newsletter_subscribed: value })
  }
  catch (e) {
    console.error('[settings] Error saving blog subscription:', e)
  }
}

const { currency, setCurrency, currencyOptions, detect: detectCurrency } = useCurrency()
const geo = useGeolocation()

const locationPermissionHint = computed(() => {
  switch (geo.permissionState.value) {
    case 'granted': return t('settings.locationGranted')
    case 'denied': return t('settings.locationDenied')
    case 'unsupported': return t('settings.locationUnsupported')
    default: return t('settings.locationPrompt')
  }
})

onMounted(() => { detectCurrency() })

type PlanKey = 'free' | 'pro' | 'max' | 'enterprise'

const planKey = computed<PlanKey>(() => {
  const raw = (user.value?.app_metadata?.plan as string | undefined)
    || (user.value?.user_metadata?.plan as string | undefined)
    || 'free'
  const normalised = raw.toLowerCase().trim()
  if (['pro', 'max', 'enterprise'].includes(normalised)) return normalised as PlanKey
  return 'free'
})

const planDisplayName = computed(() => {
  const map: Record<PlanKey, string> = {
    free: t('settings.freePlan'),
    pro: t('settings.proPlan'),
    max: t('settings.maxPlan'),
    enterprise: t('settings.enterprisePlan'),
  }
  return map[planKey.value]
})

const showUpgrade = computed(() => planKey.value !== 'enterprise')
const showManage = computed(() => planKey.value !== 'free')

type LegalDoc = 'terms-of-service' | 'privacy-policy' | 'cookie-policy'
type SettingsSubpage = LegalDoc | 'payment' | 'delete-account' | 'manage-subscription'

const legalDocTitleKeys: Record<LegalDoc, string> = {
  'terms-of-service': 'settings.termsAndConditions',
  'privacy-policy': 'settings.privacyPolicy',
  'cookie-policy': 'settings.cookiesPolicy',
}

const activeSubpage = ref<SettingsSubpage | null>(null)
const legalContent = ref<string | null>(null)
const legalLoading = ref(false)

const legalHtml = computed(() => {
  if (!legalContent.value) return ''
  const result = marked.parse(legalContent.value)
  return typeof result === 'string' ? result : ''
})

async function openDoc(doc: LegalDoc) {
  activeSubpage.value = doc
  legalLoading.value = true
  legalContent.value = null
  try {
    legalContent.value = await $fetch<string>(`/api/legal/${doc}`, { responseType: 'text' })
  }
  finally {
    legalLoading.value = false
  }
}

function openPayment() {
  activeSubpage.value = 'payment'
  legalContent.value = null
}

const tabPanelRef = ref<{ $el?: HTMLElement }>()

function resetScroll() {
  nextTick(() => {
    const el = tabPanelRef.value?.$el?.querySelector('.overflow-y-auto')
    if (el) el.scrollTop = 0
  })
}

function closeSubpage() {
  activeSubpage.value = null
  legalContent.value = null
  deleteSelectedReason.value = ''
  deleteDetail.value = ''
  deleteError.value = ''
  resetScroll()
}

watch(activeSubpage, (v) => {
  if (v) resetScroll()
})

const deleteReasons = computed(() => [
  { value: 'not-useful', label: t('settings.deleteReasonNotUseful') },
  { value: 'too-expensive', label: t('settings.deleteReasonTooExpensive') },
  { value: 'switching', label: t('settings.deleteReasonSwitching') },
  { value: 'privacy', label: t('settings.deleteReasonPrivacy') },
  { value: 'too-complicated', label: t('settings.deleteReasonTooComplicated') },
  { value: 'other', label: t('settings.deleteReasonOther') },
])

const deleteSelectedReason = ref('')
const deleteDetail = ref('')
const deleteLoading = ref(false)
const deleteError = ref('')

function openDeleteAccount() {
  deleteSelectedReason.value = ''
  deleteDetail.value = ''
  deleteError.value = ''
  deleteLoading.value = false
  activeSubpage.value = 'delete-account'
}

async function confirmDeleteAccount() {
  if (!deleteSelectedReason.value) return
  deleteLoading.value = true
  deleteError.value = ''
  try {
    await $fetch('/api/account/delete', {
      method: 'POST',
      body: {
        reason: deleteSelectedReason.value,
        detail: deleteDetail.value.trim(),
      },
    })
    await supabase.auth.signOut()
    router.push('/')
  }
  catch (err: unknown) {
    deleteError.value = err instanceof Error ? err.message : t('settings.deleteError')
  }
  finally {
    deleteLoading.value = false
  }
}

function openManageSubscription() {
  activeSubpage.value = 'manage-subscription'
  legalContent.value = null
}

const subpageTitle = computed(() => {
  const s = activeSubpage.value
  if (!s) return ''
  if (s === 'payment') return t('settings.payment')
  if (s === 'delete-account') return t('settings.deleteAccountTitle')
  if (s === 'manage-subscription') return t('settings.manageSubscription')
  return t(legalDocTitleKeys[s])
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="{ [t('settings.title')]: '/settings' }" raw-tab-labels />
    </header>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showCheckoutSuccess"
        class="mx-auto mb-4 flex w-full max-w-2xl items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
      >
        <UIcon name="i-heroicons-check-circle-20-solid" class="size-5 shrink-0 text-green-600" />
        <p class="flex-1 text-body-md font-medium text-green-800">
          {{ t('settings.checkoutSuccess') }}
        </p>
        <button
          type="button"
          class="shrink-0 text-green-600 transition-colors hover:text-green-800"
          :aria-label="t('common.close')"
          @click="showCheckoutSuccess = false"
        >
          <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
        </button>
      </div>
    </Transition>

    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel ref="tabPanelRef" class="min-h-0 min-w-0 flex-1">
        <!-- Subpages (legal, payment, delete-account) -->
        <SettingsSubpageLayout
          v-if="activeSubpage"
          :title="subpageTitle"
          @back="closeSubpage"
        >
          <!-- Delete account subpage -->
          <template v-if="activeSubpage === 'delete-account'">
            <div class="flex flex-col gap-6 pb-8 text-left">
              <p class="text-[1.0625rem] leading-relaxed text-neutral-600">
                {{ t('settings.deleteAccountDesc') }}
              </p>

              <fieldset class="space-y-2">
                <label
                  v-for="reason in deleteReasons"
                  :key="reason.value"
                  class="group flex cursor-pointer items-center gap-3 rounded-lg bg-white px-4 py-3 ghost-panel transition-all"
                  :class="deleteSelectedReason === reason.value ? 'ring-1 ring-neutral-950' : 'hover:bg-neutral-50'"
                  @click="deleteSelectedReason = reason.value"
                >
                  <span
                    class="flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-all"
                    :class="deleteSelectedReason === reason.value ? 'border-neutral-950 bg-neutral-950' : 'border-neutral-300 bg-white group-hover:border-neutral-400'"
                  >
                    <span
                      v-if="deleteSelectedReason === reason.value"
                      class="size-1.5 rounded-full bg-white"
                    />
                  </span>
                  <span class="text-body-md text-neutral-950">{{ reason.label }}</span>
                </label>
              </fieldset>

              <div>
                <textarea
                  v-model="deleteDetail"
                  :placeholder="t('settings.deleteDetailPlaceholder')"
                  rows="3"
                  class="w-full resize-none rounded-lg border border-neutral-200 bg-white px-4 py-3 text-body-md text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                />
              </div>

              <div class="rounded-lg border border-error-200 bg-error-50 px-4 py-3">
                <p class="text-label-md leading-relaxed text-error-700">
                  {{ t('settings.deleteWarning') }}
                </p>
              </div>

              <p v-if="deleteError" class="text-label-md text-error-600">
                {{ deleteError }}
              </p>

              <button
                type="button"
                :disabled="!deleteSelectedReason || deleteLoading"
                class="w-full rounded-lg bg-error-600 px-4 py-2.5 text-body-md font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-error-600"
                @click="confirmDeleteAccount"
              >
                {{ deleteLoading ? t('settings.deleteConfirming') : t('settings.deleteConfirmButton') }}
              </button>
            </div>
          </template>

          <!-- Legal doc subpages -->
          <template v-else-if="activeSubpage !== 'payment' && activeSubpage !== 'manage-subscription'">
            <div
              v-if="legalLoading"
              class="flex items-center justify-center py-16 text-sm text-neutral-400"
            >
              {{ t('common.loading') }}
            </div>
            <article
              v-else
              class="legal-doc-body pb-8 text-left text-[1.0625rem] leading-relaxed text-neutral-800"
              v-html="legalHtml"
            />
          </template>

          <!-- Manage subscription subpage -->
          <template v-else-if="activeSubpage === 'manage-subscription'">
            <div class="flex flex-col gap-5 pb-8 text-left">
              <div class="rounded-lg bg-white p-4 ghost-panel sm:p-5">
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <p class="text-label-md font-medium text-neutral-600">{{ t('settings.currentPlan') }}</p>
                    <p class="text-body-md font-semibold text-neutral-950">{{ planDisplayName }}</p>
                  </div>
                  <NuxtLink
                    v-if="showUpgrade"
                    :to="{ path: '/pricing', query: { current: planKey } }"
                    class="rounded-md bg-neutral-950 px-3 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                  >
                    {{ t('common.upgrade') }}
                  </NuxtLink>
                </div>
              </div>

              <div class="space-y-2">
                <div
                  class="flex items-baseline justify-between gap-3 text-label-md"
                >
                  <span class="font-medium text-neutral-600">{{ t('settings.requestUsage') }}</span>
                  <span class="shrink-0 font-semibold tabular-nums text-neutral-950">
                    {{ usagePercent }}%
                  </span>
                </div>
                <div
                  class="h-2.5 overflow-hidden rounded-full bg-neutral-100"
                  role="progressbar"
                  :aria-valuenow="usagePercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`Request usage ${usagePercent} percent`"
                >
                  <div
                    class="h-full rounded-full bg-neutral-950 transition-[width] duration-300 ease-out"
                    :style="{ width: `${usagePercent}%` }"
                  />
                </div>
                <p class="text-label-md text-neutral-500">
                  {{ t('settings.requestsUsed', { used: formatCount(usedRequests), limit: formatCount(limitRequests) }) }}
                </p>
              </div>

              <div class="divide-y divide-neutral-200/90 overflow-hidden rounded-lg bg-white ghost-panel">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100 sm:px-5"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-body-md font-medium text-neutral-950">{{ t('settings.changePlan') }}</p>
                    <p class="mt-0.5 text-label-md text-neutral-500">{{ t('settings.changePlanDesc') }}</p>
                  </div>
                  <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100 sm:px-5"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-body-md font-medium text-neutral-950">{{ t('settings.topUpCredits') }}</p>
                    <p class="mt-0.5 text-label-md text-neutral-500">{{ t('settings.topUpCreditsDesc') }}</p>
                  </div>
                  <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100 sm:px-5"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-body-md font-medium text-neutral-950">{{ t('settings.paymentMethod') }}</p>
                    <p class="mt-0.5 text-label-md text-neutral-500">{{ t('settings.paymentMethodDesc') }}</p>
                  </div>
                  <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100 sm:px-5"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-body-md font-medium text-neutral-950">{{ t('settings.billingHistory') }}</p>
                    <p class="mt-0.5 text-label-md text-neutral-500">{{ t('settings.billingHistoryDesc') }}</p>
                  </div>
                  <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
                </button>
              </div>

              <button
                type="button"
                class="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-body-md font-medium text-error-700 transition-colors ghost-panel hover:bg-error-50"
              >
                {{ t('settings.cancelSubscription') }}
              </button>
              <p class="text-center text-label-md text-neutral-400">
                {{ t('settings.cancelSubscriptionDesc') }}
              </p>
            </div>
          </template>

          <!-- Payment subpage -->
          <p
            v-else
            class="pb-8 text-left text-[1.0625rem] leading-relaxed text-neutral-600"
          >
            {{ t('settings.paymentPlaceholder') }}
          </p>
        </SettingsSubpageLayout>

        <!-- Main content -->
        <div v-else class="w-full" style="container-type: inline-size">
          <div
            class="mx-auto flex w-full max-w-2xl min-h-0 min-w-0 flex-1 flex-col gap-6 px-4 pb-4 sm:px-5 sm:pb-5 lg:gap-8"
            style="padding-top: max(1.5rem, calc((100cqw - 42rem) / 4))"
          >
          <!-- Guest profile -->
          <template v-if="isGuest">
            <section class="flex flex-col items-center gap-3 py-2">
              <div
                class="flex size-20 items-center justify-center rounded-full bg-neutral-100 ring-1 ring-neutral-200/80 sm:size-24"
              >
                <UIcon
                  name="i-heroicons-user-20-solid"
                  class="size-9 text-neutral-400 sm:size-10"
                />
              </div>
              <div class="space-y-0.5 text-center">
                <h2 class="text-lg font-semibold text-neutral-950">
                  {{ t('settings.guest') }}
                </h2>
                <p class="text-body-md text-neutral-400">
                  {{ t('settings.notSignedIn') }}
                </p>
              </div>
              <NuxtLink
                :to="{ path: '/sign-in', query: { redirect: route.fullPath } }"
                class="mt-1 flex items-center justify-center rounded-md bg-neutral-950 px-5 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
              >
                {{ t('common.signIn') }}
              </NuxtLink>
            </section>
          </template>

          <!-- Authenticated profile -->
          <template v-else>
            <section class="flex flex-col items-center gap-3 py-2">
              <img
                v-if="avatarUrl && !avatarError"
                :src="avatarUrl"
                :alt="displayName"
                referrerpolicy="no-referrer"
                class="size-20 rounded-full object-cover ring-1 ring-neutral-200/80 sm:size-24"
                @error="avatarError = true"
              >
              <div
                v-else
                class="btn-gradient flex size-20 items-center justify-center rounded-full text-xl font-bold text-white ring-1 ring-neutral-200/80 sm:size-24 sm:text-2xl"
              >
                {{ initials }}
              </div>

              <!-- Edit mode -->
              <template v-if="editingProfile">
                <div class="flex w-full max-w-xs flex-col gap-3">
                  <div>
                    <label class="mb-1 block text-label-md font-medium text-neutral-600">
                      {{ t('settings.displayName') }}
                    </label>
                    <input
                      v-model="editName"
                      type="text"
                      class="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                    >
                  </div>
                  <div>
                    <label class="mb-1 block text-label-md font-medium text-neutral-600">
                      {{ t('common.email') }}
                    </label>
                    <input
                      v-model="editEmail"
                      type="email"
                      :disabled="!isEmailAuth"
                      class="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400"
                    >
                    <p v-if="!isEmailAuth" class="mt-1 text-label-md text-neutral-400">
                      {{ t('settings.emailManagedByProvider') }}
                    </p>
                  </div>
                  <p v-if="profileError" class="text-label-md text-error-600">
                    {{ profileError }}
                  </p>
                  <div class="mt-1 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      :disabled="profileSaving"
                      class="rounded-md bg-neutral-950 px-4 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                      @click="saveProfile"
                    >
                      {{ profileSaving ? t('settings.saving') : t('common.save') }}
                    </button>
                    <button
                      type="button"
                      :disabled="profileSaving"
                      class="rounded-md px-4 py-1.5 text-body-md font-normal text-neutral-600 transition-colors hover:text-neutral-950 disabled:opacity-50"
                      @click="cancelEditProfile"
                    >
                      {{ t('common.cancel') }}
                    </button>
                  </div>
                </div>
              </template>

              <!-- Display mode -->
              <template v-else>
                <div class="space-y-0.5 text-center">
                  <h2 class="text-lg font-semibold text-neutral-950">
                    {{ displayName }}
                  </h2>
                  <p v-if="email" class="text-body-md text-neutral-500">
                    {{ email }}
                  </p>
                </div>
                <button
                  type="button"
                  class="mt-1 rounded-md bg-neutral-950 px-5 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                  @click="startEditProfile"
                >
                  {{ t('settings.editProfile') }}
                </button>
              </template>
            </section>

            <!-- Plan & Usage -->
            <section class="min-w-0">
              <h2 class="mb-3 text-body-md font-semibold tracking-tight text-neutral-950">
                {{ t('settings.planAndUsage') }}
              </h2>
              <div
                class="space-y-5 rounded-lg bg-white p-4 ghost-panel sm:p-5"
              >
                <div
                  class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div class="min-w-0 flex-1 space-y-1">
                    <p class="text-label-md font-medium text-neutral-600">
                      {{ t('settings.currentPlan') }}
                    </p>
                    <p class="text-body-md font-medium text-neutral-950">
                      {{ planDisplayName }}
                    </p>
                  </div>
                  <div class="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                    <NuxtLink
                      v-if="showUpgrade"
                      :to="{ path: '/pricing', query: { current: planKey } }"
                      class="rounded-md bg-neutral-950 px-3 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                    >
                      {{ t('common.upgrade') }}
                    </NuxtLink>
                    <button
                      v-if="showManage"
                      type="button"
                      class="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-body-md font-normal text-neutral-950 transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                      @click="openManageSubscription"
                    >
                      {{ t('common.manage') }}
                    </button>
                  </div>
                </div>

                <div class="space-y-2">
                  <div
                    class="flex items-baseline justify-between gap-3 text-label-md"
                  >
                    <span class="font-medium text-neutral-600">{{ t('settings.requestUsage') }}</span>
                    <span class="shrink-0 font-semibold tabular-nums text-neutral-950">
                      {{ usagePercent }}%
                    </span>
                  </div>
                  <div
                    class="h-2.5 overflow-hidden rounded-full bg-neutral-100"
                    role="progressbar"
                    :aria-valuenow="usagePercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-label="`Request usage ${usagePercent} percent`"
                  >
                    <div
                      class="h-full rounded-full bg-neutral-950 transition-[width] duration-300 ease-out"
                      :style="{ width: `${usagePercent}%` }"
                    />
                  </div>
                  <p class="text-label-md text-neutral-500">
                    {{ t('settings.requestsUsed', { used: formatCount(usedRequests), limit: formatCount(limitRequests) }) }}
                  </p>
                </div>
              </div>
            </section>

          <!-- Account -->
          <SettingsSection :title="t('settings.account')">
              <SettingsSectionRow clickable @click="openPayment">
                <template #icon>
                  <UIcon
                    name="i-heroicons-credit-card-20-solid"
                    class="size-4 shrink-0 text-neutral-500"
                  />
                </template>
                <template #label>{{ t('settings.payment') }}</template>
                <template #trailing>
                  <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
                </template>
              </SettingsSectionRow>
            </SettingsSection>
          </template>

          <!-- General -->
          <SettingsSection :title="t('settings.general')">
            <SettingsDropdown
              icon="i-heroicons-language-20-solid"
              :label="t('settings.language')"
              :options="languageOptions"
              :model-value="locale"
              :visible-count="5"
              @update:model-value="changeLocale($event)"
            />
            <SettingsDropdown
              icon="i-heroicons-currency-dollar-20-solid"
              :label="t('settings.currency')"
              :options="currencyOptions"
              :model-value="currency"
              :visible-count="5"
              @update:model-value="setCurrency($event as any)"
            />
            <div>
              <SettingsSectionRow>
                <template #icon>
                  <UIcon
                    name="i-heroicons-map-pin-20-solid"
                    class="size-4 shrink-0 text-neutral-500"
                  />
                </template>
                <template #label>{{ t('settings.locationSharing') }}</template>
                <template #trailing>
                  <SettingsToggle :model-value="geo.enabled.value" @update:model-value="geo.toggle()" />
                </template>
              </SettingsSectionRow>
              <p class="px-5 pb-3 text-label-md text-neutral-400">
                {{ locationPermissionHint }}
              </p>
            </div>
          </SettingsSection>

          <!-- Notifications (authenticated only — hidden for guests) -->
          <SettingsSection :title="t('settings.notifications')" requires-auth>
            <SettingsSectionRow requires-auth>
              <template #icon>
                <UIcon
                  name="i-heroicons-envelope-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.emailNotif') }}</template>
              <template #trailing>
                <SettingsToggle v-model="emailNotif" />
              </template>
            </SettingsSectionRow>
            <SettingsSectionRow requires-auth>
              <template #icon>
                <UIcon
                  name="i-heroicons-bell-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.pushNotif') }}</template>
              <template #trailing>
                <SettingsToggle v-model="pushNotif" />
              </template>
            </SettingsSectionRow>
            <SettingsSectionRow requires-auth>
              <template #icon>
                <UIcon
                  name="i-heroicons-megaphone-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.productUpdates') }}</template>
              <template #trailing>
                <SettingsToggle v-model="productUpdates" />
              </template>
            </SettingsSectionRow>
            <SettingsSectionRow requires-auth>
              <template #icon>
                <UIcon
                  name="i-heroicons-check-badge-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.responseCompletions') }}</template>
              <template #trailing>
                <SettingsToggle v-model="responseCompletions" />
              </template>
            </SettingsSectionRow>
            <SettingsSectionRow requires-auth>
              <template #icon>
                <UIcon
                  name="i-heroicons-newspaper-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.blogNewsletter') }}</template>
              <template #trailing>
                <SettingsToggle
                  :model-value="userSettings.blog_newsletter_subscribed"
                  :disabled="blogSubscriptionSaving"
                  @update:model-value="saveBlogSubscription"
                />
              </template>
            </SettingsSectionRow>
          </SettingsSection>

          <!-- Other / Legal -->
          <SettingsSection :title="t('settings.other')">
            <SettingsSectionRow clickable @click="openDoc('terms-of-service')">
              <template #icon>
                <UIcon
                  name="i-heroicons-document-text-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.termsAndConditions') }}</template>
              <template #trailing>
                <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
              </template>
            </SettingsSectionRow>
            <SettingsSectionRow clickable @click="openDoc('privacy-policy')">
              <template #icon>
                <UIcon
                  name="i-heroicons-shield-check-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.privacyPolicy') }}</template>
              <template #trailing>
                <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
              </template>
            </SettingsSectionRow>
            <SettingsSectionRow clickable @click="openDoc('cookie-policy')">
              <template #icon>
                <UIcon
                  name="i-ph-cookie-fill"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>{{ t('settings.cookiesPolicy') }}</template>
              <template #trailing>
                <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
              </template>
            </SettingsSectionRow>
          </SettingsSection>

          <!-- Delete account & Log out (authenticated only) -->
          <div v-if="!isGuest" class="flex flex-col gap-2.5">
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-body-md font-medium text-neutral-950 transition-colors ghost-panel hover:bg-neutral-50"
              @click="openDeleteAccount"
            >
              {{ t('settings.deleteAccount') }}
            </button>
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-body-md font-medium text-error-700 transition-colors ghost-panel hover:bg-error-50"
              @click="onLogOut"
            >
              <UIcon
                name="i-heroicons-arrow-right-start-on-rectangle-20-solid"
                class="size-4 shrink-0"
              />
              {{ t('common.signOut') }}
            </button>
          </div>

          <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
          </div>
        </div>
      </TabPanel>
    </div>
  </div>
</template>

<style scoped>
.legal-doc-body :deep(p) {
  margin-top: 0;
  margin-bottom: 1rem;
}

.legal-doc-body :deep(p:last-child) {
  margin-bottom: 0;
}

.legal-doc-body :deep(strong) {
  font-weight: 600;
  color: rgb(10 10 10);
}

.legal-doc-body :deep(h2) {
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: rgb(10 10 10);
}

.legal-doc-body :deep(h2:first-child) {
  margin-top: 0;
}

.legal-doc-body :deep(ul),
.legal-doc-body :deep(ol) {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
}

.legal-doc-body :deep(li) {
  margin-bottom: 0.375rem;
}

.legal-doc-body :deep(li:last-child) {
  margin-bottom: 0;
}

.legal-doc-body :deep(a) {
  color: rgb(10 10 10);
  text-decoration: underline;
  text-decoration-color: rgb(212 212 212);
  text-underline-offset: 2px;
  transition:
    color 150ms ease,
    text-decoration-color 150ms ease;
}

.legal-doc-body :deep(a:hover) {
  color: rgb(58 58 58);
  text-decoration-color: rgb(163 163 163);
}

.legal-doc-body :deep(hr) {
  margin: 2rem 0;
  border: 0;
  border-top: 1px solid rgb(229 229 229);
}

.legal-doc-body :deep(table) {
  width: 100%;
  margin: 1rem 0 1.25rem;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.legal-doc-body :deep(th),
.legal-doc-body :deep(td) {
  border: 1px solid rgb(229 229 229);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}

.legal-doc-body :deep(th) {
  font-weight: 600;
  background-color: rgb(250 250 250);
  color: rgb(10 10 10);
}

.legal-doc-body :deep(code) {
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  background-color: rgb(245 245 245);
  color: rgb(23 23 23);
}

.legal-doc-body :deep(blockquote) {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 3px solid rgb(229 229 229);
  color: rgb(82 82 82);
}
</style>
