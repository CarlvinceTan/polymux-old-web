<script setup lang="ts">
const isOpen = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  accept: []
}>()

const { t } = useI18n()

type SlideKey = 'welcome' | 'workflows' | 'browser' | 'vault' | 'terms'
const SLIDES: SlideKey[] = ['welcome', 'workflows', 'browser', 'vault', 'terms']

const currentIndex = ref(0)
const acknowledged = ref(false)
const direction = ref<1 | -1>(1)

const currentSlide = computed<SlideKey>(() => SLIDES[currentIndex.value]!)
const isFirst = computed(() => currentIndex.value === 0)
const isLast = computed(() => currentIndex.value === SLIDES.length - 1)
const transitionName = computed(() => (direction.value === 1 ? 'slide-fwd' : 'slide-back'))

function goTo(index: number) {
  if (index === currentIndex.value) return
  direction.value = index > currentIndex.value ? 1 : -1
  currentIndex.value = index
}
function next() {
  if (isLast.value) return
  goTo(currentIndex.value + 1)
}
function back() {
  if (isFirst.value) return
  goTo(currentIndex.value - 1)
}
function skipToTerms() {
  goTo(SLIDES.length - 1)
}
function handleAccept() {
  if (!acknowledged.value) return
  emit('accept')
  isOpen.value = false
}

watch(isOpen, (open) => {
  if (!open) {
    acknowledged.value = false
    currentIndex.value = 0
    direction.value = 1
  }
})

// Gate the Teleport on a client-only mounted flag instead of <ClientOnly>.
// ClientOnly's default fallback is a <span> placeholder, which hydration
// compares against the empty fragment Teleport leaves in place on the server
// — that mismatch was cascading into sibling hydration warnings.
const isMounted = ref(false)

// Lock body scroll while the modal is open so the page underneath can't be
// reached by scrolling. Cleaned up on unmount in case the modal is destroyed
// without going through the close transition.
if (import.meta.client) {
  watch(isOpen, (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  }, { immediate: true })

  onMounted(() => {
    isMounted.value = true
  })

  onBeforeUnmount(() => {
    document.body.style.overflow = ''
  })
}

const SLIDE_HERO: Record<SlideKey, string> = {
  welcome: 'bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50',
  workflows: 'bg-gradient-to-br from-sky-50 via-indigo-50 to-violet-50',
  browser: 'bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50',
  vault: 'bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50',
  terms: 'bg-gradient-to-br from-neutral-50 via-white to-neutral-100',
}
</script>

<template>
  <Teleport v-if="isMounted" to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <!--
        The backdrop intentionally has no @click handler — the modal can
        only be closed by accepting the agreement on the final slide.
        ESC is also a no-op (no @keydown.esc handler anywhere in the tree).
      -->
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-[2px]"
        role="presentation"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="scale-95 opacity-0"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-if="isOpen"
            class="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_rgba(0,0,0,0.18),0_4px_12px_rgba(0,0,0,0.08)] ring-1 ring-neutral-200"
            role="dialog"
            aria-modal="true"
            :aria-label="t(`onboarding.${currentSlide}.title`)"
            @click.stop
          >
            <!-- Skip (floats over the hero, hidden on terms) -->
            <button
              v-if="!isLast"
              type="button"
              class="absolute right-5 top-5 z-10 inline-flex items-center gap-1 text-[0.8125rem] text-neutral-500 outline-none transition-colors hover:text-neutral-900 focus-visible:underline focus-visible:underline-offset-4"
              @click="skipToTerms"
            >
              {{ t('onboarding.skip') }}
              <svg class="size-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z" clip-rule="evenodd" />
              </svg>
            </button>

            <!-- Slide content -->
            <Transition :name="transitionName" mode="out-in">
              <div :key="currentSlide" class="flex flex-col">
                <!-- Hero panel -->
                <div :class="['relative flex h-44 shrink-0 items-center justify-center overflow-hidden sm:h-48', SLIDE_HERO[currentSlide]]">
                  <div class="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.55),transparent_60%)]" />
                  <div class="relative flex size-20 items-center justify-center rounded-2xl bg-white/85 shadow-[0_4px_20px_rgba(0,0,0,0.06)] ring-1 ring-white/70 backdrop-blur-sm">
                    <!-- welcome — sparkles -->
                    <svg v-if="currentSlide === 'welcome'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                      <path d="M20 3v4" />
                      <path d="M22 5h-4" />
                      <path d="M4 17v2" />
                      <path d="M5 18H3" />
                    </svg>
                    <!-- workflows — connected nodes -->
                    <svg v-else-if="currentSlide === 'workflows'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="6" cy="6" r="2.5" />
                      <circle cx="18" cy="6" r="2.5" />
                      <circle cx="6" cy="18" r="2.5" />
                      <circle cx="18" cy="18" r="2.5" />
                      <path d="M8.5 6h7" />
                      <path d="M6 8.5v7" />
                      <path d="M18 8.5v7" />
                      <path d="M8.5 18h7" />
                    </svg>
                    <!-- browser — window with cursor -->
                    <svg v-else-if="currentSlide === 'browser'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <rect x="2.5" y="4" width="19" height="14" rx="2" />
                      <path d="M2.5 8.5h19" />
                      <circle cx="5.5" cy="6.25" r="0.4" fill="currentColor" />
                      <circle cx="7.5" cy="6.25" r="0.4" fill="currentColor" />
                      <circle cx="9.5" cy="6.25" r="0.4" fill="currentColor" />
                      <path d="m12 13 3 7 1.4-3 3-1.4z" />
                    </svg>
                    <!-- vault — lock -->
                    <svg v-else-if="currentSlide === 'vault'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      <circle cx="12" cy="16" r="1" />
                    </svg>
                    <!-- terms — shield with check -->
                    <svg v-else class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                </div>

                <!-- Body -->
                <div class="px-6 py-7 text-center sm:px-12 sm:py-9">
                  <h2 class="text-[1.4rem] font-semibold tracking-tight text-neutral-950 sm:text-[1.625rem]">
                    {{ t(`onboarding.${currentSlide}.title`) }}
                  </h2>
                  <p class="mx-auto mt-2.5 max-w-md text-[0.9375rem] leading-relaxed text-neutral-600">
                    {{ t(`onboarding.${currentSlide}.description`) }}
                  </p>

                  <!-- Terms-specific content -->
                  <div v-if="currentSlide === 'terms'" class="mx-auto mt-5 max-w-lg text-left">
                    <ul class="space-y-2.5 text-sm text-neutral-700">
                      <li class="flex gap-3">
                        <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                        <span>{{ t('onboarding.terms.bullet1') }}</span>
                      </li>
                      <li class="flex gap-3">
                        <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                        <span>{{ t('onboarding.terms.bullet2') }}</span>
                      </li>
                      <li class="flex gap-3">
                        <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                        <span>{{ t('onboarding.terms.bullet3') }}</span>
                      </li>
                      <li class="flex gap-3">
                        <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-400" />
                        <span>{{ t('onboarding.terms.bullet4') }}</span>
                      </li>
                    </ul>
                    <p class="mt-4 text-xs text-neutral-500">
                      {{ t('onboarding.terms.footnote') }}
                      <NuxtLink
                        to="/terms-of-service"
                        class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
                      >
                        {{ t('onboarding.terms.termsOfService') }}
                      </NuxtLink>
                      {{ t('onboarding.terms.and') }}
                      <NuxtLink
                        to="/privacy-policy"
                        class="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950"
                      >
                        {{ t('onboarding.terms.privacyPolicy') }}
                      </NuxtLink>{{ t('onboarding.terms.footnoteEnd') }}
                    </p>
                    <label class="mt-3 flex cursor-pointer items-start gap-2">
                      <input
                        v-model="acknowledged"
                        type="checkbox"
                        class="mt-0.5 size-3.5 shrink-0 cursor-pointer appearance-none rounded-sm border border-neutral-300 bg-white checked:border-neutral-400 checked:bg-white checked:bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%20fill=%22none%22%20stroke=%22%23404040%22%20stroke-width=%222.5%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22><polyline%20points=%223,8%207,12%2013,4%22/></svg>')] checked:bg-center checked:bg-no-repeat focus:outline-none focus:ring-1 focus:ring-neutral-300"
                      >
                      <span class="text-xs leading-snug text-neutral-500">
                        {{ t('onboarding.terms.acknowledgement') }}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Footer: back / dots / next -->
            <div class="relative flex items-center justify-between border-t border-neutral-100 bg-neutral-50/60 px-5 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium outline-none ring-neutral-950 transition-colors focus-visible:ring-2"
                :class="isFirst ? 'invisible' : 'text-neutral-600 hover:text-neutral-950'"
                :tabindex="isFirst ? -1 : 0"
                :aria-hidden="isFirst"
                @click="back"
              >
                <svg class="size-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 0 1 0 1.414L9.414 10l3.293 3.293a1 1 0 1 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z" clip-rule="evenodd" />
                </svg>
                {{ t('onboarding.back') }}
              </button>

              <div class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5">
                <button
                  v-for="(slide, i) in SLIDES"
                  :key="slide"
                  type="button"
                  class="rounded-full outline-none ring-neutral-950 transition-all focus-visible:ring-2"
                  :class="i === currentIndex
                    ? 'h-1.5 w-5 bg-neutral-950'
                    : 'h-1.5 w-1.5 bg-neutral-300 hover:bg-neutral-400'"
                  :aria-label="t('onboarding.stepLabel', { current: i + 1, total: SLIDES.length })"
                  :aria-current="i === currentIndex ? 'step' : undefined"
                  @click="goTo(i)"
                />
              </div>

              <button
                v-if="!isLast"
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-neutral-950 px-3.5 py-1.5 text-sm font-medium text-white outline-none transition-colors hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
                @click="next"
              >
                {{ t('onboarding.next') }}
                <svg class="size-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
              <button
                v-else
                type="button"
                :disabled="!acknowledged"
                class="inline-flex items-center gap-1 rounded-md bg-neutral-950 px-4 py-1.5 text-sm font-medium text-white outline-none transition-colors hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                @click="handleAccept"
              >
                {{ t('onboarding.getStarted') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-fwd-enter-active,
.slide-fwd-leave-active,
.slide-back-enter-active,
.slide-back-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.slide-fwd-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.slide-fwd-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}
.slide-back-enter-from {
  opacity: 0;
  transform: translateX(-24px);
}
.slide-back-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
