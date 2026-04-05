<script setup lang="ts">
export interface ChatMessage {
  role: 'agent' | 'user'
  text: string
}

export interface ChatViewportConfig {
  url: string
  agentName: string
  currentAction: string
  isLoading: boolean
  isWorking: boolean
  isDone: boolean
}

defineProps<{
  welcome: boolean
  chatTitle: string
  userName: string
  welcomeSuggestion: string
  messages: ChatMessage[]
}>()

const command = defineModel<string>('command', { required: true })
const browserMode = defineModel<boolean>('browserMode', { required: true })
const viewportList = defineModel<ChatViewportConfig[]>('viewportList', { required: true })

const emit = defineEmits<{
  send: [value: string]
  welcomeSuggestion: []
}>()

const expandedViewportIndex = ref<number | null>(null)

const mainViewport = computed(() => viewportList.value[0])
const thumbViewports = computed(() => viewportList.value.slice(1))

function promoteViewport(indexInFullList: number) {
  const list = viewportList.value
  if (indexInFullList < 1 || indexInFullList >= list.length) return
  const next = [...list]
  const [picked] = next.splice(indexInFullList, 1)
  next.unshift(picked)
  viewportList.value = next
}

function deleteViewport(index: number) {
  const list = viewportList.value
  if (index < 0 || index >= list.length) return
  const next = [...list]
  next.splice(index, 1)
  viewportList.value = next
  if (expandedViewportIndex.value === index)
    expandedViewportIndex.value = null
  else if (expandedViewportIndex.value !== null && expandedViewportIndex.value > index)
    expandedViewportIndex.value = expandedViewportIndex.value - 1

  if (next.length === 0)
    browserMode.value = false
}

function demoteViewport(index: number) {
  const list = viewportList.value
  if (list.length <= 1) return
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.push(item)
  viewportList.value = next
  expandedViewportIndex.value = null
}

function toggleExpandViewport(index: number) {
  expandedViewportIndex.value
    = expandedViewportIndex.value === index ? null : index
}

function trafficHandlers(index: number) {
  return {
    onTrafficRed: () => deleteViewport(index),
    onTrafficYellow: () => demoteViewport(index),
    onTrafficGreen: () => toggleExpandViewport(index),
  }
}

function viewportBinds(vp: ChatViewportConfig, index: number) {
  return { ...vp, ...trafficHandlers(index) }
}

const expandedViewport = computed(() => {
  const i = expandedViewportIndex.value
  if (i === null) return null
  return viewportList.value[i] ?? null
})

function closeModal() {
  expandedViewportIndex.value = null
}

function onModalBackdropClick() {
  closeModal()
}

function onSendInternal(value: string) {
  emit('send', value)
}
</script>

<template>
  <TabPanel class="min-h-0 min-w-0 flex-1">
    <template v-if="!welcome" #title>
      <h2 class="min-w-0 text-7xl font-extrabold leading-snug text-neutral-950 sm:text-panel-title">
        {{ chatTitle }}
      </h2>
    </template>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Welcome -->
      <div v-if="welcome"
        class="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-8">
        <div class="flex max-w-lg flex-col items-center gap-6">
          <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            How can I help, {{ userName }}?
          </h1>
          <button type="button"
            class="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-linear-to-b from-amber-50/90 to-amber-100/40 px-4 py-3 text-meta leading-snug shadow-sm transition-all hover:border-amber-300 hover:from-amber-50 hover:to-amber-100/60 sm:text-xs"
            @click="emit('welcomeSuggestion')">
            <UIcon name="i-heroicons-sparkles-20-solid" class="welcome-sparkle size-[1.15em] shrink-0 text-amber-600"
              aria-hidden="true" />
            <span class="welcome-gold-text font-medium">{{ welcomeSuggestion }}</span>
          </button>
        </div>
      </div>

      <!-- Chat (messaging and/or browser split) -->
      <div v-else
        class="flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-out md:flex-row md:gap-0">
        <!-- Browser column -->
        <div v-if="browserMode"
          class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain border-neutral-200/90 md:w-auto md:min-h-0 md:min-w-0 md:border-r">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-3 @container-[size]">
            <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center">
              <div class="mx-auto w-[min(100cqw,max(1px,calc((100cqh-5.5rem)*16/9)))] max-w-full min-w-0 shrink-0">
                <Viewport v-if="mainViewport" class="w-full min-w-0 shrink-0" v-bind="viewportBinds(mainViewport, 0)" />
              </div>
            </div>
          </div>
          <template v-if="thumbViewports.length > 0">
            <div class="h-px w-full shrink-0 bg-neutral-200/90" aria-hidden="true" />
            <div class="w-full min-w-0 shrink-0 overflow-visible">
              <div
                class="scrollbar-hide flex snap-x snap-mandatory items-center gap-0 overflow-x-auto scroll-px-2 px-4 pb-3 pt-2">
                <button v-for="(vp, idx) in thumbViewports" :key="`${vp.url}-${idx}`" type="button"
                  class="flex h-auto min-w-0 w-48 shrink-0 snap-center snap-always cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 bg-transparent py-0.5 text-left outline-none ring-0 transition-colors hover:bg-neutral-950/4 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
                  :aria-label="`Show ${vp.url} as main viewport`" @click="promoteViewport(idx + 1)">
                  <div class="min-w-0 w-full max-w-full p-2">
                    <Viewport v-bind="viewportBinds(vp, idx + 1)" thumbnail :show-action-text="false" :show-bar="false"
                      class="max-w-full min-w-0 w-full select-none" />
                  </div>
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Messages + input -->
        <div class="flex min-h-0 flex-col md:shrink-0" :class="browserMode
          ? 'w-full md:w-[min(26rem,34vw)]'
          : 'min-w-0 flex-1'
          ">
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4" role="log"
            aria-live="polite" aria-relevant="additions">
            <div class="w-full space-y-3">
              <div v-for="(msg, i) in messages" :key="i" class="flex w-full"
                :class="msg.role === 'agent' ? 'justify-start' : 'justify-end'">
                <div class="flex w-fit max-w-[min(100%,36rem)] gap-2.5"
                  :class="msg.role === 'agent' ? 'items-start' : 'flex-row-reverse items-start'">
                  <template v-if="msg.role === 'agent'">
                    <AgentProfilePicture />
                    <div
                      class="min-w-0 rounded-2xl rounded-tl-none border border-neutral-200/70 bg-neutral-100 px-3.5 py-2.5 sm:px-4 sm:py-3">
                      <p class="m-0 text-left text-meta leading-relaxed text-neutral-600 sm:text-xs">
                        {{ msg.text }}
                      </p>
                    </div>
                  </template>
                  <template v-else>
                    <div
                      class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-white"
                      role="img" aria-label="You">
                      <svg class="size-4 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" aria-hidden="true">
                        <circle cx="12" cy="8" r="3" />
                        <path d="M6 20v-1a6 6 0 0112 0v1" />
                      </svg>
                    </div>
                    <div
                      class="min-w-0 rounded-2xl rounded-tr-none border border-neutral-200/70 bg-neutral-200/35 px-3.5 py-2.5 sm:px-4 sm:py-3">
                      <p class="m-0 text-right text-meta leading-relaxed text-neutral-800 sm:text-xs">
                        {{ msg.text }}
                      </p>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <div v-if="browserMode" class="shrink-0 border-t border-neutral-200/90 bg-white px-4 py-3 sm:px-5 sm:py-4">
            <PromptInput v-model="command" full-width hint="Message this chat…" @send="onSendInternal" />
          </div>
        </div>
      </div>
    </div>

    <template v-if="!browserMode" #footer>
      <PromptInput v-model="command" full-width hint="Message this chat…" @send="onSendInternal" />
    </template>
  </TabPanel>

  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in" enter-from-class="opacity-0"
      leave-to-class="opacity-0">
      <div v-if="expandedViewportIndex !== null && expandedViewport"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/55 p-4 backdrop-blur-[2px]"
        role="presentation" @click.self="onModalBackdropClick">
        <div
          class="relative max-h-[min(92vh,920px)] w-full max-w-[min(96vw,72rem)] overflow-auto rounded-xl bg-white p-3 shadow-2xl ring-1 ring-neutral-950/10"
          role="dialog" aria-modal="true" aria-label="Expanded browser preview" @click.stop>
          <Viewport class="w-full min-w-0" v-bind="viewportBinds(expandedViewport, expandedViewportIndex as number)" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
@keyframes welcome-gold-sweep {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: 200% 50%;
  }
}

@keyframes welcome-sparkle-pulse {

  0%,
  100% {
    opacity: 1;
    filter: brightness(1);
  }

  50% {
    opacity: 0.85;
    filter: brightness(1.25);
  }
}

.welcome-gold-text {
  background-image: linear-gradient(90deg,
      #92400e 0%,
      #b45309 18%,
      #d97706 32%,
      #ca8a04 44%,
      #fbbf24 50%,
      #fcd34d 56%,
      #fbbf24 62%,
      #d97706 76%,
      #b45309 88%,
      #92400e 100%);
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: welcome-gold-sweep 2.8s linear infinite;
}

.welcome-sparkle {
  animation: welcome-sparkle-pulse 2.8s ease-in-out infinite;
}
</style>
