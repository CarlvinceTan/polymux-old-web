<script setup lang="ts">
import type { ViewportState } from '~/composables/types'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()

const props = defineProps<{
  viewportList: ViewportState[]
  frameUrls?: Map<string, string>
  browserAgentCap?: number
  activeAgentId: string | null
}>()

const emit = defineEmits<{
  promoteViewport: [agentId: string]
  demoteActive: []
  closeViewport: [agentId: string]
  spawnBrowserAgent: []
}>()

const expandedAgentId = ref<string | null>(null)
const expandedViewport = computed(() => {
  if (!expandedAgentId.value) return null
  return props.viewportList.find(v => v.agentId === expandedAgentId.value) ?? null
})
const expandedFrameUrl = computed(() => {
  const vp = expandedViewport.value
  return vp ? props.frameUrls?.get(vp.agentId) : undefined
})

const activeViewport = computed(() => {
  if (!props.activeAgentId) return null
  return props.viewportList.find(v => v.agentId === props.activeAgentId) ?? null
})
const activeFrameUrl = computed(() => {
  const vp = activeViewport.value
  return vp ? props.frameUrls?.get(vp.agentId) : undefined
})

const agentCount = computed(() => props.viewportList.length)
const agentCap = computed(() => props.browserAgentCap ?? 0)
const isAtCap = computed(() => agentCount.value >= agentCap.value && agentCap.value > 0)

const toast = useAppToast()

function onSpawnOrWarn() {
  if (isAtCap.value) {
    toast.show(t('browser.agentCapReached'), 'warning')
    return
  }
  emit('spawnBrowserAgent')
}

function onPromote(agentId: string) {
  emit('promoteViewport', agentId)
}

function onClose(agentId: string) {
  if (expandedAgentId.value === agentId) expandedAgentId.value = null
  emit('closeViewport', agentId)
}

function onDemoteActive() {
  expandedAgentId.value = null
  emit('demoteActive')
}

function onToggleExpand(agentId: string) {
  expandedAgentId.value = expandedAgentId.value === agentId ? null : agentId
}

function activeTrafficHandlers() {
  return {
    onTrafficRed: () => {
      if (props.activeAgentId) onClose(props.activeAgentId)
    },
    onTrafficYellow: () => onDemoteActive(),
    onTrafficGreen: () => {
      if (props.activeAgentId) onToggleExpand(props.activeAgentId)
    },
  }
}

function activeViewportBinds(vp: ViewportState) {
  return {
    ...vp,
    ...activeTrafficHandlers(),
    frameUrl: props.frameUrls?.get(vp.agentId),
  }
}

function expandedTrafficHandlers() {
  if (!expandedAgentId.value) return {}
  const id = expandedAgentId.value
  return {
    onTrafficRed: () => onClose(id),
    onTrafficYellow: onDemoteActive,
    onTrafficGreen: () => { expandedAgentId.value = null },
  }
}
</script>

<template>
  <div
    v-bind="$attrs"
    class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain md:w-auto md:min-h-0 md:min-w-0"
  >
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-3 @container-[size]">
      <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <div class="mx-auto w-[min(100cqw,max(1px,calc((100cqh-5.5rem)*3/2)))] max-w-full min-w-0 shrink-0">
          <Viewport
            v-if="activeViewport"
            class="w-full min-w-0 shrink-0"
            v-bind="activeViewportBinds(activeViewport)"
          />
          <div
            v-else
            class="ghost-panel flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-center"
            style="aspect-ratio: 3 / 2"
          >
            <UIcon name="i-heroicons-computer-desktop-20-solid" class="mb-3 size-8 text-neutral-300" />
            <p class="px-6 text-sm text-neutral-400">
              {{ t('browser.noActiveViewport') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="h-px w-full shrink-0 bg-neutral-200/90" aria-hidden="true" />
    <div class="w-full min-w-0 shrink-0 overflow-visible">
      <div class="scrollbar-hide flex items-center gap-0 overflow-x-auto px-4 pb-3 pt-2">
        <div
          v-for="vp in viewportList"
          :key="vp.agentId"
          role="button"
          tabindex="0"
          class="group/thumb relative flex h-auto min-w-0 w-48 shrink-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 bg-transparent py-0.5 text-left outline-none ring-0 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
          :class="vp.agentId === activeAgentId ? 'bg-neutral-950/6' : 'hover:bg-neutral-950/4'"
          :aria-label="t('chat.showAsMainViewport', { url: vp.url })"
          @click="onPromote(vp.agentId)"
          @keydown.enter="onPromote(vp.agentId)"
          @keydown.space.prevent="onPromote(vp.agentId)"
        >
          <div class="min-w-0 w-full max-w-full p-2">
            <Viewport
              v-bind="{ ...vp, frameUrl: frameUrls?.get(vp.agentId) }"
              thumbnail
              :show-action-text="false"
              :show-bar="false"
              class="max-w-full min-w-0 w-full select-none"
            />
          </div>
          <button
            type="button"
            class="absolute right-2 top-2 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-xs leading-none text-neutral-400 opacity-0 ring-0 transition-colors hover:text-neutral-700 group-hover/thumb:opacity-100"
            :aria-label="t('browser.closeAgent')"
            @click.stop="onClose(vp.agentId)"
          >
            <UIcon name="i-heroicons-x-mark" class="size-3" />
          </button>
        </div>

        <button
          type="button"
          class="group/add flex h-auto min-w-0 w-48 shrink-0 cursor-pointer flex-col items-stretch overflow-visible rounded-lg border-0 py-0.5 text-left outline-none ring-0 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-950/35"
          :class="isAtCap ? 'opacity-40' : ''"
          :aria-label="t('browser.addAgent')"
          @click="onSpawnOrWarn"
        >
          <div class="min-w-0 w-full max-w-full p-2 pt-2.5">
            <div class="flex w-full max-w-full flex-none flex-col gap-1.5 overflow-visible select-none">
              <div class="flex w-full max-w-full flex-col overflow-visible rounded-lg">
                <div class="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 transition-colors group-hover/add:border-neutral-600">
                  <div class="relative w-full overflow-hidden bg-neutral-50" style="aspect-ratio: 3 / 2">
                    <div class="absolute inset-0 flex items-center justify-center">
                      <UIcon name="i-heroicons-plus-20-solid" class="size-6 text-neutral-400 transition-colors group-hover/add:text-neutral-600" />
                    </div>
                  </div>
                </div>
              </div>
              <div class="flex gap-2 items-center justify-center px-0">
                <div class="flex min-w-0 items-center font-mono tracking-wide gap-1 text-2xs text-neutral-500 transition-colors group-hover/add:text-neutral-600 sm:text-caption">
                  <span class="font-bold uppercase">{{ agentCount }}</span>
                  <span>/</span>
                  <span class="font-bold uppercase">{{ agentCap }}</span>
                  <span>agents</span>
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>

  <ViewportModal
    v-if="expandedViewport"
    :viewport="expandedViewport"
    :frame-url="expandedFrameUrl"
    v-bind="expandedTrafficHandlers()"
    @close="expandedAgentId = null"
  />
</template>