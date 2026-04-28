<script setup lang="ts">
const isOpen = defineModel<boolean>('open', { default: false })

const { t, locale, locales, setLocale } = useI18n()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const displayName = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.full_name as string | undefined)
    || (meta?.name as string | undefined)
    || user.value?.email?.split('@')[0]
    || ''
})

const email = computed(() => user.value?.email || '')

const isEmailAuth = computed(() => user.value?.app_metadata?.provider === 'email')

const avatarUrl = computed(() => {
  const meta = user.value?.user_metadata
  return (meta?.avatar_url as string | undefined) || (meta?.picture as string | undefined) || null
})

const avatarError = ref(false)
watch(avatarUrl, () => { avatarError.value = false })

const initials = computed(() => {
  const name = displayName.value.trim() || 'U'
  return name.split(/\s+/).map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
})

async function onLogOut() {
  isOpen.value = false
  const { signOut } = useSignOut()
  await signOut()
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

watch(isOpen, async (open) => {
  if (open && user.value) {
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

// Browser extension preference (per-device, localStorage-backed). Flipping
// this controls whether session WS connections opt into `?mode=extension`
// and therefore route browser sub-agents through the user's installed
// Chrome extension instead of the server's Chromium.
const { extensionEnabled } = useExtensionPrefs()

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

watch(isOpen, (open) => {
  if (open) detectCurrency()
})

type SettingsSubpage = 'payment' | 'delete-account'

const activeSubpage = ref<SettingsSubpage | null>(null)

function openPayment() {
  activeSubpage.value = 'payment'
}

function openLegalPage(path: '/terms-of-service' | '/privacy-policy' | '/cookie-policy') {
  closeModal()
  navigateTo(path)
}

const scrollContainer = ref<HTMLElement | null>(null)

function resetScroll() {
  nextTick(() => {
    if (scrollContainer.value) scrollContainer.value.scrollTop = 0
  })
}

function closeSubpage() {
  activeSubpage.value = null
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
      body: { reason: deleteSelectedReason.value, detail: deleteDetail.value.trim() },
    })
    isOpen.value = false
    const { signOut } = useSignOut()
    await signOut()
  }
  catch (err: unknown) {
    deleteError.value = err instanceof Error ? err.message : t('settings.deleteError')
  }
  finally {
    deleteLoading.value = false
  }
}

const subpageTitle = computed(() => {
  const s = activeSubpage.value
  if (!s) return ''
  if (s === 'payment') return t('settings.payment')
  return t('settings.deleteAccountTitle')
})

function closeModal() {
  closeSubpage()
  isOpen.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (activeSubpage.value) closeSubpage()
    else closeModal()
  }
}

watch(isOpen, (open) => {
  if (open) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isOpen"
          class="fixed inset-0 z-[9997] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
          @click="closeModal"
        >
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="scale-95 opacity-0"
            leave-to-class="scale-95 opacity-0"
          >
            <div
              v-if="isOpen"
              class="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]"
              style="max-height: 90svh"
              role="dialog"
              aria-modal="true"
              :aria-label="t('settings.title')"
              @click.stop
            >
              <button
                type="button"
                class="absolute top-4 right-4 z-10 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                @click="closeModal"
              >
                <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
              </button>
              <button
                v-if="activeSubpage"
                type="button"
                class="absolute top-4 left-4 z-10 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                @click="closeSubpage"
              >
                <UIcon name="i-heroicons-arrow-left-20-solid" class="size-4" />
              </button>

              <div class="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-white to-transparent" />
              <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-white to-transparent" />

              <!-- Scrollable body -->
              <div ref="scrollContainer" class="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
                <!-- Subpages -->
                <div v-if="activeSubpage" class="px-5 pt-16 pb-5">
                  <!-- Delete account -->
                  <template v-if="activeSubpage === 'delete-account'">
                    <div class="flex flex-col gap-6 pb-2 text-left">
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
                            <span v-if="deleteSelectedReason === reason.value" class="size-1.5 rounded-full bg-white" />
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
                      <p v-if="deleteError" class="text-label-md text-error-600">{{ deleteError }}</p>
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

                  <!-- Payment placeholder -->
                  <p v-else class="pb-2 text-left text-[1.0625rem] leading-relaxed text-neutral-600">
                    {{ t('settings.paymentPlaceholder') }}
                  </p>
                </div>

                <!-- Main settings content -->
                <div v-else class="flex flex-col gap-6 px-5 pt-16 pb-5">
                  <!-- Profile -->
                  <section class="flex flex-col items-center gap-3 py-2">
                      <img
                        v-if="avatarUrl && !avatarError"
                        :src="avatarUrl"
                        :alt="displayName"
                        referrerpolicy="no-referrer"
                        class="size-20 rounded-full object-cover ring-1 ring-neutral-200/80"
                        @error="avatarError = true"
                      >
                      <div
                        v-else
                        class="btn-gradient flex size-20 items-center justify-center rounded-full text-xl font-bold text-white ring-1 ring-neutral-200/80"
                      >
                        {{ initials }}
                      </div>

                      <!-- Edit mode -->
                      <template v-if="editingProfile">
                        <div class="flex w-full max-w-xs flex-col gap-3">
                          <div>
                            <label class="mb-1 block text-label-md font-medium text-neutral-600">{{ t('settings.displayName') }}</label>
                            <input v-model="editName" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400">
                          </div>
                          <div>
                            <label class="mb-1 block text-label-md font-medium text-neutral-600">{{ t('common.email') }}</label>
                            <input v-model="editEmail" type="email" :disabled="!isEmailAuth" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400">
                            <p v-if="!isEmailAuth" class="mt-1 text-label-md text-neutral-400">{{ t('settings.emailManagedByProvider') }}</p>
                          </div>
                          <p v-if="profileError" class="text-label-md text-error-600">{{ profileError }}</p>
                          <div class="mt-1 flex items-center justify-center gap-2">
                            <button type="button" :disabled="profileSaving" class="rounded-md bg-neutral-950 px-4 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950" @click="saveProfile">
                              {{ profileSaving ? t('settings.saving') : t('common.save') }}
                            </button>
                            <button type="button" :disabled="profileSaving" class="rounded-md px-4 py-1.5 text-body-md font-normal text-neutral-600 transition-colors hover:text-neutral-950 disabled:opacity-50" @click="cancelEditProfile">
                              {{ t('common.cancel') }}
                            </button>
                          </div>
                        </div>
                      </template>

                      <!-- Display mode -->
                      <template v-else>
                        <div class="space-y-0.5 text-center">
                          <h2 class="text-lg font-semibold text-neutral-950">{{ displayName }}</h2>
                          <p v-if="email" class="text-body-md text-neutral-500">{{ email }}</p>
                        </div>
                        <button type="button" class="mt-1 rounded-md bg-neutral-950 px-5 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950" @click="startEditProfile">
                          {{ t('settings.editProfile') }}
                        </button>
                      </template>
                    </section>

                  <!-- Account -->
                  <SettingsSection :title="t('settings.account')">
                    <SettingsSectionRow clickable @click="openPayment">
                      <template #icon>
                        <UIcon name="i-heroicons-credit-card-20-solid" class="size-4 shrink-0 text-neutral-500" />
                      </template>
                      <template #label>{{ t('settings.payment') }}</template>
                      <template #trailing>
                        <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" />
                      </template>
                    </SettingsSectionRow>
                  </SettingsSection>

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
                          <UIcon name="i-heroicons-map-pin-20-solid" class="size-4 shrink-0 text-neutral-500" />
                        </template>
                        <template #label>{{ t('settings.locationSharing') }}</template>
                        <template #trailing>
                          <SettingsToggle :model-value="geo.enabled.value" @update:model-value="geo.toggle()" />
                        </template>
                      </SettingsSectionRow>
                      <p class="px-5 pb-3 text-label-md text-neutral-400">{{ locationPermissionHint }}</p>
                    </div>
                  </SettingsSection>

                  <!-- Notifications -->
                  <SettingsSection :title="t('settings.notifications')">
                    <SettingsSectionRow>
                      <template #icon><UIcon name="i-heroicons-envelope-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.emailNotif') }}</template>
                      <template #trailing><SettingsToggle v-model="emailNotif" /></template>
                    </SettingsSectionRow>
                    <SettingsSectionRow>
                      <template #icon><UIcon name="i-heroicons-bell-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.pushNotif') }}</template>
                      <template #trailing><SettingsToggle v-model="pushNotif" /></template>
                    </SettingsSectionRow>
                    <SettingsSectionRow>
                      <template #icon><UIcon name="i-heroicons-megaphone-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.productUpdates') }}</template>
                      <template #trailing><SettingsToggle v-model="productUpdates" /></template>
                    </SettingsSectionRow>
                    <SettingsSectionRow>
                      <template #icon><UIcon name="i-heroicons-check-badge-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.responseCompletions') }}</template>
                      <template #trailing><SettingsToggle v-model="responseCompletions" /></template>
                    </SettingsSectionRow>
                    <SettingsSectionRow>
                      <template #icon><UIcon name="i-heroicons-newspaper-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
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

                  <!-- Browser Extension -->
                  <SettingsSection :title="t('settings.browserExtension')">
                    <SettingsSectionRow>
                      <template #icon><UIcon name="i-heroicons-puzzle-piece-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.usePolymuxExtension') }}</template>
                      <template #trailing><SettingsToggle v-model="extensionEnabled" /></template>
                    </SettingsSectionRow>
                  </SettingsSection>

                  <!-- Other / Legal -->
                  <SettingsSection :title="t('settings.other')">
                    <SettingsSectionRow clickable @click="openLegalPage('/terms-of-service')">
                      <template #icon><UIcon name="i-heroicons-document-text-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.termsAndConditions') }}</template>
                      <template #trailing><UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" /></template>
                    </SettingsSectionRow>
                    <SettingsSectionRow clickable @click="openLegalPage('/privacy-policy')">
                      <template #icon><UIcon name="i-heroicons-shield-check-20-solid" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.privacyPolicy') }}</template>
                      <template #trailing><UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" /></template>
                    </SettingsSectionRow>
                    <SettingsSectionRow clickable @click="openLegalPage('/cookie-policy')">
                      <template #icon><UIcon name="i-ph-cookie-fill" class="size-4 shrink-0 text-neutral-500" /></template>
                      <template #label>{{ t('settings.cookiesPolicy') }}</template>
                      <template #trailing><UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400" /></template>
                    </SettingsSectionRow>
                  </SettingsSection>

                  <!-- Delete & Sign out -->
                  <div class="flex flex-col gap-2.5">
                    <button type="button" class="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-body-md font-medium text-neutral-950 transition-colors ghost-panel hover:bg-neutral-50" @click="openDeleteAccount">
                      {{ t('settings.deleteAccount') }}
                    </button>
                    <button type="button" class="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-body-md font-medium text-error-700 transition-colors ghost-panel hover:bg-error-50" @click="onLogOut">
                      <UIcon name="i-heroicons-arrow-right-start-on-rectangle-20-solid" class="size-4 shrink-0" />
                      {{ t('common.signOut') }}
                    </button>
                  </div>

                  <div class="h-2 w-full shrink-0" aria-hidden="true" />
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

