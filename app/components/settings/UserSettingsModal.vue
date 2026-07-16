<script setup lang="ts">
const props = withDefaults(defineProps<{
  inline?: boolean
}>(), {
  inline: false,
})

const isOpen = defineModel<boolean>('open', { default: false })
const isInline = computed(() => props.inline)
const isPanelVisible = computed(() => isInline.value || isOpen.value)

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
  return name.charAt(0).toUpperCase()
})

async function onLogOut() {
  if (!isInline.value) isOpen.value = false
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
const { open: openImportModal } = usePasswordImportModal()

function openImportPasswords() {
  openImportModal()
  if (!isInline.value) isOpen.value = false
}

watch(
  () => [isPanelVisible.value, user.value?.id] as const,
  async ([visible]) => {
    if (visible && user.value) {
      await fetchSettings(true)
    }
  },
  { immediate: true },
)

const languageOptions = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map(l => ({
    value: l.code,
    label: l.name,
  })),
)

function changeLocale(code: string) {
  void setLocale(code as typeof locale.value)
}

async function saveBlogSubscription(value: boolean) {
  try {
    await useUserSettings().saveSettings({ blog_newsletter_subscribed: value })
  }
  catch (e) {
    console.error('[settings] Error saving blog subscription:', e)
  }
}

async function saveAllNotifications(value: boolean) {
  try {
    await useUserSettings().saveSettings({ all_notifications_enabled: value })
  }
  catch (e) {
    console.error('[settings] Error saving all-notifications preference:', e)
  }
}

async function saveShowCursorOverlay(value: boolean) {
  try {
    await useUserSettings().saveSettings({ show_cursor_overlay: value })
  }
  catch (e) {
    console.error('[settings] Error saving cursor overlay preference:', e)
  }
}

const voiceAutoShutoffDraft = ref(5)
watch(
  () => userSettings.value.voice_auto_shutoff_seconds,
  (value) => { voiceAutoShutoffDraft.value = value },
  { immediate: true },
)

async function saveVoiceAutoShutoff() {
  const value = Math.max(0, Math.floor(Number(voiceAutoShutoffDraft.value) || 0))
  voiceAutoShutoffDraft.value = value
  if (value === userSettings.value.voice_auto_shutoff_seconds) return
  try {
    await useUserSettings().saveSettings({ voice_auto_shutoff_seconds: value })
  }
  catch (e) {
    console.error('[settings] Error saving voice auto-shutoff preference:', e)
    voiceAutoShutoffDraft.value = userSettings.value.voice_auto_shutoff_seconds
  }
}

const geo = useGeolocation({ active: false })

const locationDescription = computed(() => {
  switch (geo.permissionState.value) {
    case 'granted': return t('settings.locationGranted')
    case 'denied': return t('settings.locationDenied')
    case 'unsupported': return t('settings.locationUnsupported')
    default: return t('settings.locationPrompt')
  }
})

/* ---- Navigation ---- */
type SettingsTab = 'general' | 'appearance' | 'account' | 'notifications' | 'privacy'

const activeTab = ref<SettingsTab>('general')

const tabs = computed(() => [
  { key: 'general' as const, label: t('settings.general'), icon: 'i-heroicons-cog-6-tooth' },
  { key: 'appearance' as const, label: t('settings.appearance'), icon: 'i-heroicons-swatch' },
  { key: 'notifications' as const, label: t('settings.notifications'), icon: 'i-heroicons-bell' },
  { key: 'account' as const, label: t('settings.account'), icon: 'i-heroicons-user-circle' },
  { key: 'privacy' as const, label: t('settings.privacyLegal'), icon: 'i-heroicons-lock-closed' },
])

/* ---- Subpages ---- */
type SettingsSubpage = 'payment' | 'delete-account'

const activeSubpage = ref<SettingsSubpage | null>(null)

function openPayment() {
  activeSubpage.value = 'payment'
}

function openLegalPage(path: '/terms-of-service' | '/privacy-policy' | '/cookie-policy') {
  if (isInline.value) closeSubpage()
  else closeModal()
  navigateTo(path)
}

const scrollContainer = ref<HTMLElement | null>(null)

function resetScroll() {
  nextTick(() => {
    if (scrollContainer.value) scrollContainer.value.scrollTop = 0
  })
}

function selectTab(tab: SettingsTab) {
  if (activeSubpage.value) closeSubpage()
  activeTab.value = tab
  resetScroll()
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

const paneTitle = computed(() =>
  activeSubpage.value ? subpageTitle.value : t('settings.title'),
)

function closeModal() {
  closeSubpage()
  editingProfile.value = false
  activeTab.value = 'general'
  if (isInline.value) return
  isOpen.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (activeSubpage.value) closeSubpage()
    else closeModal()
  }
}

watch(isPanelVisible, (open) => {
  if (open && !isInline.value) document.addEventListener('keydown', handleKeydown)
  else document.removeEventListener('keydown', handleKeydown)
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <ClientOnly>
    <Teleport to="body" :disabled="isInline">
      <Transition
        :css="!isInline"
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isPanelVisible"
          :class="isInline
            ? 'flex min-h-0 min-w-0 flex-1 flex-col'
            : 'fixed inset-0 z-[9997] flex items-stretch justify-end bg-black/25 p-2 backdrop-blur-[2px] sm:p-4'"
          @click="!isInline && closeModal()"
        >
          <Transition
            :css="!isInline"
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="translate-x-5 opacity-0"
            leave-to-class="translate-x-5 opacity-0"
          >
            <div
              v-if="isPanelVisible"
              class="relative flex w-full flex-col overflow-hidden"
              :class="isInline
                ? 'min-h-0 flex-1 bg-transparent'
                : 'modal-surface h-full max-w-xl rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]'"
              :style="isInline ? undefined : 'max-height: calc(100svh - 1rem)'"
              :role="isInline ? undefined : 'dialog'"
              :aria-modal="isInline ? undefined : 'true'"
              :aria-label="t('settings.title')"
              @click.stop
            >
              <!-- ===== Top bar: title + close ===== -->
              <header class="flex shrink-0 items-center justify-between gap-3 px-6 pb-4 pt-5">
                <div class="flex min-w-0 items-center gap-2">
                  <button
                    v-if="activeSubpage"
                    type="button"
                    class="-ml-1.5 rounded-md p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
                    @click="closeSubpage"
                  >
                    <UIcon name="i-heroicons-arrow-left-20-solid" class="size-5" />
                  </button>
                  <h2 class="truncate text-[1.375rem] font-semibold tracking-tight text-neutral-950">{{ paneTitle }}</h2>
                </div>
                <button
                  v-if="!isInline"
                  type="button"
                  class="rounded-md p-1 text-neutral-400 transition-colors hover:text-neutral-700"
                  :aria-label="t('common.close')"
                  @click="closeModal"
                >
                  <UIcon name="i-heroicons-x-mark-20-solid" class="size-4" />
                </button>
              </header>

              <!-- ===== Tab bar (horizontal; hidden inside a subpage) ===== -->
              <nav v-if="!activeSubpage" class="scrollbar-hide flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200 px-3">
                <button
                  v-for="tab in tabs"
                  :key="tab.key"
                  type="button"
                  class="-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm transition-colors"
                  :class="activeTab === tab.key
                    ? 'border-neutral-950 font-medium text-neutral-950'
                    : 'border-transparent text-neutral-600 hover:text-neutral-900'"
                  @click="selectTab(tab.key)"
                >
                  <UIcon :name="tab.icon" class="size-[18px] shrink-0" :class="activeTab === tab.key ? 'text-neutral-950' : 'text-neutral-500'" />
                  {{ tab.label }}
                </button>
              </nav>
              <div v-else class="mx-6 shrink-0 border-t border-neutral-200/80" />

              <div ref="scrollContainer" class="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pb-6">
                  <!-- ===== Subpages ===== -->
                  <template v-if="activeSubpage === 'delete-account'">
                    <div class="flex flex-col gap-6 pt-5 text-left">
                      <p class="text-body-lg leading-relaxed text-neutral-600">
                        {{ t('settings.deleteAccountDesc') }}
                      </p>
                      <fieldset class="space-y-2">
                        <label
                          v-for="reason in deleteReasons"
                          :key="reason.value"
                          class="group flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
                          :class="deleteSelectedReason === reason.value ? 'border-neutral-950 bg-neutral-50' : 'border-neutral-200 hover:bg-neutral-50'"
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
                      <textarea
                        v-model="deleteDetail"
                        name="delete-detail"
                        :placeholder="t('settings.deleteDetailPlaceholder')"
                        rows="3"
                        class="w-full resize-none rounded-lg border border-neutral-200 bg-white px-4 py-3 text-body-md text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                      />
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

                  <template v-else-if="activeSubpage === 'payment'">
                    <p class="pt-5 text-body-lg leading-relaxed text-neutral-600">
                      {{ t('settings.paymentPlaceholder') }}
                    </p>
                  </template>

                  <!-- ===== General ===== -->
                  <template v-else-if="activeTab === 'general'">
                    <SettingsSection>
                      <SettingsSectionRow>
                        <template #label>{{ t('settings.voiceAutoShutoff') }}</template>
                        <template #description>{{ t('settings.voiceAutoShutoffHint') }}</template>
                        <template #trailing>
                          <input
                            v-model.number="voiceAutoShutoffDraft"
                            name="voice-auto-shutoff"
                            type="number"
                            min="0"
                            step="1"
                            inputmode="numeric"
                            :disabled="blogSubscriptionSaving"
                            class="w-16 rounded-md border border-neutral-200 bg-white px-2 py-1 text-center text-body-md text-neutral-950 outline-none transition [appearance:textfield] focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            @blur="saveVoiceAutoShutoff"
                            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                          >
                        </template>
                      </SettingsSectionRow>
                      <SettingsSectionRow clickable @click="openImportPasswords">
                        <template #label>{{ t('settings.importPasswords') }}</template>
                        <template #description>{{ t('settings.importPasswordsHint') }}</template>
                        <template #trailing>
                          <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600" />
                        </template>
                      </SettingsSectionRow>
                    </SettingsSection>
                  </template>

                  <!-- ===== Appearance ===== -->
                  <template v-else-if="activeTab === 'appearance'">
                    <SettingsSection>
                      <SettingsDropdown
                        :label="t('settings.language')"
                        :options="languageOptions"
                        :model-value="locale"
                        :visible-count="5"
                        @update:model-value="changeLocale($event)"
                      />
                    </SettingsSection>
                  </template>

                  <!-- ===== Account ===== -->
                  <template v-else-if="activeTab === 'account'">
                    <SettingsSection>
                      <!-- Profile -->
                      <div class="py-4 pr-3">
                        <div class="flex items-center gap-4">
                          <img
                            v-if="avatarUrl && !avatarError"
                            :src="avatarUrl"
                            :alt="displayName"
                            referrerpolicy="no-referrer"
                            class="size-12 shrink-0 rounded-full object-cover ring-1 ring-neutral-200/80"
                            @error="avatarError = true"
                          >
                          <div
                            v-else
                            class="btn-gradient flex size-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ring-1 ring-neutral-200/80"
                          >
                            {{ initials }}
                          </div>
                          <div class="min-w-0 flex-1">
                            <div class="truncate text-[0.9375rem] font-semibold text-neutral-950">{{ displayName }}</div>
                            <div v-if="email" class="truncate text-sm text-neutral-500">{{ email }}</div>
                          </div>
                          <button
                            v-if="!editingProfile"
                            type="button"
                            class="shrink-0 rounded-lg bg-neutral-950 px-4 py-1.5 text-sm font-normal text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                            @click="startEditProfile"
                          >
                            {{ t('settings.editProfile') }}
                          </button>
                        </div>

                        <!-- Edit mode -->
                        <div v-if="editingProfile" class="mt-4 flex flex-col gap-3 rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200/70">
                          <div>
                            <label class="mb-1 block text-label-md font-medium text-neutral-600">{{ t('settings.displayName') }}</label>
                            <input v-model="editName" name="display-name" autocomplete="name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400">
                          </div>
                          <div>
                            <label class="mb-1 block text-label-md font-medium text-neutral-600">{{ t('common.email') }}</label>
                            <input v-model="editEmail" name="email" autocomplete="email" type="email" :disabled="!isEmailAuth" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-body-md text-neutral-950 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400">
                            <p v-if="!isEmailAuth" class="mt-1 text-label-md text-neutral-400">{{ t('settings.emailManagedByProvider') }}</p>
                          </div>
                          <p v-if="profileError" class="text-label-md text-error-600">{{ profileError }}</p>
                          <div class="flex items-center gap-2">
                            <button type="button" :disabled="profileSaving" class="rounded-md bg-neutral-950 px-4 py-1.5 text-body-md font-normal text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950" @click="saveProfile">
                              {{ profileSaving ? t('settings.saving') : t('common.save') }}
                            </button>
                            <button type="button" :disabled="profileSaving" class="rounded-md px-4 py-1.5 text-body-md font-normal text-neutral-600 transition-colors hover:text-neutral-950 disabled:opacity-50" @click="cancelEditProfile">
                              {{ t('common.cancel') }}
                            </button>
                          </div>
                        </div>
                      </div>

                      <!-- Billing -->
                      <SettingsSectionRow clickable @click="openPayment">
                        <template #label>{{ t('settings.payment') }}</template>
                        <template #trailing>
                          <UIcon name="i-heroicons-chevron-right-20-solid" class="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600" />
                        </template>
                      </SettingsSectionRow>

                      <!-- Account actions -->
                      <button type="button" class="group flex w-full items-center gap-2.5 py-4 text-left text-[0.9375rem] font-medium text-neutral-800 transition-colors hover:text-error-700" @click="openDeleteAccount">
                        <UIcon name="i-heroicons-trash" class="size-[18px] shrink-0 text-neutral-400 transition-colors group-hover:text-error-700" />
                        {{ t('settings.deleteAccount') }}
                      </button>
                      <button type="button" class="group flex w-full items-center gap-2.5 py-4 text-left text-[0.9375rem] font-medium text-error-700 transition-colors hover:text-error-800" @click="onLogOut">
                        <UIcon name="i-heroicons-arrow-right-start-on-rectangle" class="size-[18px] shrink-0" />
                        {{ t('common.signOut') }}
                      </button>
                    </SettingsSection>
                  </template>

                  <!-- ===== Notifications ===== -->
                  <template v-else-if="activeTab === 'notifications'">
                    <SettingsSection>
                      <SettingsSectionRow>
                        <template #label>{{ t('settings.allNotifications') }}</template>
                        <template #description>{{ t('settings.allNotificationsHint') }}</template>
                        <template #trailing>
                          <SettingsToggle
                            :model-value="userSettings.all_notifications_enabled"
                            :disabled="blogSubscriptionSaving"
                            @update:model-value="saveAllNotifications"
                          />
                        </template>
                      </SettingsSectionRow>
                      <SettingsSectionRow>
                        <template #label>{{ t('settings.blogNewsletter') }}</template>
                        <template #trailing>
                          <SettingsToggle
                            :model-value="userSettings.blog_newsletter_subscribed && userSettings.all_notifications_enabled"
                            :disabled="blogSubscriptionSaving || !userSettings.all_notifications_enabled"
                            @update:model-value="saveBlogSubscription"
                          />
                        </template>
                      </SettingsSectionRow>
                    </SettingsSection>
                  </template>

                  <!-- ===== Privacy & legal ===== -->
                  <template v-else-if="activeTab === 'privacy'">
                    <SettingsSection>
                      <SettingsSectionRow>
                        <template #label>{{ t('settings.locationSharing') }}</template>
                        <template #description>{{ locationDescription }}</template>
                        <template #trailing>
                          <SettingsToggle :model-value="geo.enabled.value" @update:model-value="geo.toggle()" />
                        </template>
                      </SettingsSectionRow>
                      <SettingsSectionRow clickable @click="openLegalPage('/terms-of-service')">
                        <template #label>{{ t('settings.termsAndConditions') }}</template>
                        <template #trailing><UIcon name="i-heroicons-arrow-up-right-20-solid" class="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600" /></template>
                      </SettingsSectionRow>
                      <SettingsSectionRow clickable @click="openLegalPage('/privacy-policy')">
                        <template #label>{{ t('settings.privacyPolicy') }}</template>
                        <template #trailing><UIcon name="i-heroicons-arrow-up-right-20-solid" class="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600" /></template>
                      </SettingsSectionRow>
                      <SettingsSectionRow clickable @click="openLegalPage('/cookie-policy')">
                        <template #label>{{ t('settings.cookiesPolicy') }}</template>
                        <template #trailing><UIcon name="i-heroicons-arrow-up-right-20-solid" class="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600" /></template>
                      </SettingsSectionRow>
                    </SettingsSection>
                  </template>
                </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

  </ClientOnly>
</template>
