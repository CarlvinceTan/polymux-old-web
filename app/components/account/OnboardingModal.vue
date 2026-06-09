<script setup lang="ts">
import {
  demoPosterSrc,
  demoVideoSrc,
  ONBOARDING_SLIDES,
  SLIDE_HERO,
  slideHasRecording,
  type SlideKey,
} from '~/config/onboarding'

const isOpen = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  accept: []
  'import-passwords': []
}>()

const { t } = useI18n()

const SLIDES = ONBOARDING_SLIDES.map(s => s.key)

const currentIndex = ref(0)
const acknowledged = ref(false)
const direction = ref<1 | -1>(1)

const currentSlide = computed<SlideKey>(() => SLIDES[currentIndex.value]!)
const isFirst = computed(() => currentIndex.value === 0)
const isLast = computed(() => currentIndex.value === SLIDES.length - 1)
const transitionName = computed(() => (direction.value === 1 ? 'slide-fwd' : 'slide-back'))
const hasDemo = computed(() => slideHasRecording(currentSlide.value))

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

const isMounted = ref(false)

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
</script>

<template>
  <Teleport v-if="isMounted" to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
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

            <Transition :name="transitionName" mode="out-in">
              <div :key="currentSlide" class="flex flex-col">
                <div
                  :class="[
                    'relative shrink-0 overflow-hidden',
                    hasDemo ? 'aspect-video' : 'flex h-44 items-center justify-center sm:h-48',
                    SLIDE_HERO[currentSlide],
                  ]"
                >
                  <div
                    v-if="!hasDemo"
                    class="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.55),transparent_60%)]"
                  />
                  <OnboardingDemo
                    v-if="hasDemo"
                    :src="demoVideoSrc(currentSlide)"
                    :poster="demoPosterSrc(currentSlide)"
                    :label="t(`onboarding.${currentSlide}.title`)"
                  />
                  <div
                    v-else
                    class="relative flex size-20 items-center justify-center rounded-2xl bg-white/85 shadow-[0_4px_20px_rgba(0,0,0,0.06)] ring-1 ring-white/70 backdrop-blur-sm"
                  >
                    <svg v-if="currentSlide === 'welcome'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                      <path d="M20 3v4" />
                      <path d="M22 5h-4" />
                      <path d="M4 17v2" />
                      <path d="M5 18H3" />
                    </svg>
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
                    <svg v-else-if="currentSlide === 'storage'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M3 7v10a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 17V7" />
                      <path d="M3 7l9 5 9-5" />
                      <path d="M12 22V12" />
                    </svg>
                    <svg v-else-if="currentSlide === 'integrations'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 2v4" />
                      <path d="M12 18v4" />
                      <path d="m4.93 4.93 2.83 2.83" />
                      <path d="m16.24 16.24 2.83 2.83" />
                      <path d="M2 12h4" />
                      <path d="M18 12h4" />
                      <path d="m4.93 19.07 2.83-2.83" />
                      <path d="m16.24 7.76 2.83-2.83" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <svg v-else-if="currentSlide === 'vault'" class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      <circle cx="12" cy="16" r="1" />
                    </svg>
                    <svg v-else class="size-9 text-neutral-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                </div>

                <div class="px-6 py-7 text-center sm:px-12 sm:py-9">
                  <h2 class="text-[1.4rem] font-semibold tracking-tight text-neutral-950 sm:text-[1.625rem]">
                    {{ t(`onboarding.${currentSlide}.title`) }}
                  </h2>
                  <p class="mx-auto mt-2.5 max-w-md text-[0.9375rem] leading-relaxed text-neutral-600">
                    {{ t(`onboarding.${currentSlide}.description`) }}
                  </p>

                  <button
                    v-if="currentSlide === 'vault'"
                    type="button"
                    class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                    @click="emit('import-passwords')"
                  >
                    <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 3v12" />
                      <path d="m8 11 4 4 4-4" />
                      <path d="M4 21h16" />
                    </svg>
                    {{ t('onboarding.vault.importCta') }}
                  </button>

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
                    <p class="mt-4 text-center text-xs text-neutral-500">
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
                    <label class="mx-auto mt-3 flex max-w-sm cursor-pointer items-start gap-2">
                      <input
                        v-model="acknowledged"
                        name="acknowledged"
                        type="checkbox"
                        class="onboarding-ack-checkbox mt-0.5 size-3.5 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                      >
                      <span class="text-xs leading-snug text-neutral-500">
                        {{ t('onboarding.terms.acknowledgement') }}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </Transition>

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
                class="inline-flex items-center gap-1 rounded-md bg-neutral-950 px-4 py-1.5 text-sm font-medium text-white outline-none transition-colors hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
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
.onboarding-ack-checkbox {
  appearance: none;
  -webkit-appearance: none;
  accent-color: var(--color-primary);
  background-color: #ffffff;
  border: 1px solid var(--color-neutral-300);
  border-radius: 0.125rem;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 0.75rem 0.75rem;
}
.onboarding-ack-checkbox:checked {
  background-color: #ffffff;
  border-color: var(--color-neutral-500);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230a0a0a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='3,8 7,12 13,4'/></svg>");
}

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
