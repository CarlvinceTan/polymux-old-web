<script setup lang="ts">
const headerTabs = {
  Console: '/workspace/console',
  Schedule: '/workspace/schedule',
  Visualiser: '/workspace/visualiser',
} as const satisfies Record<string, string>

type LayoutMode = 'grid' | 'single'

const layoutMode = ref<LayoutMode>('grid')

const panelTitle =
  'Finding the most expensive hotels in Bali and Malaysia...'

const command = ref('')

interface ChatMessage {
  role: 'agent' | 'user'
  text: string
}

const chatMessages = ref<ChatMessage[]>([
  {
    role: 'agent',
    text:
      'System synchronization complete. Orchestrator is now managing parallel streams across four distinct instances. Each subagent has claimed a viewport; you can issue a global command below to steer all of them.',
  },
  {
    role: 'user',
    text: 'Prioritize five-star listings only and surface the nightly rate in each view.',
  },
])

const viewports = [
  {
    url: 'localhost:3001/instance_alpha',
    agentName: 'SUBAGENT 01',
    currentAction: 'REFACTORING...',
    isLoading: true,
    isWorking: true,
    isDone: false,
  },
  {
    url: 'localhost:3001/instance_beta',
    agentName: 'SUBAGENT 02',
    currentAction: 'VALIDATING DATA...',
    isLoading: true,
    isWorking: true,
    isDone: false,
  },
  {
    url: 'localhost:3001/instance_gamma',
    agentName: 'SUBAGENT 03',
    currentAction: 'SUMMARIZING...',
    isLoading: false,
    isWorking: false,
    isDone: true,
  },
  {
    url: 'localhost:3001/instance_delta',
    agentName: 'SUBAGENT 04',
    currentAction: 'SCRAPING RATES...',
    isLoading: true,
    isWorking: true,
    isDone: false,
  },
]

function sendCommand(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return
  chatMessages.value.push({ role: 'user', text: trimmed })
  command.value = ''
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <template #title>
          <h2 class="min-w-0 text-7xl font-extrabold leading-snug text-neutral-950 sm:text-panel-title">
            {{ panelTitle }}
          </h2>
        </template>
        <template #actions>
          <div class="flex shrink-0 items-center gap-2 text-caption font-semibold tracking-overline text-neutral-500">
            <span class="whitespace-nowrap">LAYOUT:</span>
            <div class="flex items-center gap-px rounded-md bg-neutral-200/60 p-px">
              <button
                type="button"
                class="rounded-[0.3125rem] p-1 text-neutral-500 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                :class="layoutMode === 'grid'
                  ? 'bg-white text-neutral-950 shadow-sm'
                  : 'hover:text-neutral-800'
                "
                aria-label="Grid layout"
                :aria-pressed="layoutMode === 'grid'"
                @click="layoutMode = 'grid'"
              >
                <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1.25" />
                  <rect x="14" y="3" width="7" height="7" rx="1.25" />
                  <rect x="3" y="14" width="7" height="7" rx="1.25" />
                  <rect x="14" y="14" width="7" height="7" rx="1.25" />
                </svg>
              </button>
              <button
                type="button"
                class="rounded-[0.3125rem] p-1 text-neutral-500 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                :class="layoutMode === 'single'
                  ? 'bg-white text-neutral-950 shadow-sm'
                  : 'hover:text-neutral-800'
                "
                aria-label="Single column layout"
                :aria-pressed="layoutMode === 'single'"
                @click="layoutMode = 'single'"
              >
                <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
            </div>
          </div>
        </template>

        <div class="relative min-h-0 min-w-0 flex-1">
          <div
            class="absolute inset-0 overflow-y-auto overscroll-contain px-4 pb-36 pt-3 sm:px-5 sm:pb-40 sm:pt-4"
          >
            <div
              class="grid gap-3 sm:gap-4"
              :class="layoutMode === 'grid'
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'mx-auto w-full max-w-lg grid-cols-1'
              "
            >
              <div v-for="(vp, index) in viewports" :key="index">
                <Viewport v-bind="vp" compact />
              </div>
            </div>
          </div>

          <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end">
            <div class="pointer-events-none absolute inset-0 bg-linear-to-t from-white from-25% via-white/90 via-50% to-transparent" />
            <div class="relative px-4 pb-3 pt-6 sm:px-5 sm:pb-4">
                <div
                  class="ghost-panel pointer-events-auto w-full rounded-xl bg-white"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  <div class="max-h-30 overflow-y-auto overscroll-contain px-3.5 py-3 sm:max-h-34 rounded-xl">
                    <div class="space-y-3">
                      <div
                        v-for="(msg, i) in chatMessages"
                        :key="i"
                        :class="msg.role === 'agent' ? 'flex gap-2.5' : 'text-right'"
                      >
                        <template v-if="msg.role === 'agent'">
                          <span class="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-neutral-400" aria-hidden="true">
                            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
                              />
                            </svg>
                          </span>
                          <p class="text-left text-meta leading-relaxed text-neutral-600 sm:text-xs">
                            {{ msg.text }}
                          </p>
                        </template>
                        <p v-else class="text-meta leading-relaxed text-neutral-800 sm:text-xs">
                          <span class="font-medium text-neutral-500">You · </span>{{ msg.text }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </div>
        </div>

        <template #footer>
          <PromptInput
            v-model="command"
            full-width
            hint="Issue a global command..."
            @send="sendCommand"
          />
        </template>
      </TabPanel>
    </div>
  </div>
</template>
