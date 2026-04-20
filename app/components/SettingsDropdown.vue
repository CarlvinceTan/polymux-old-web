<script setup lang="ts">
export interface SettingsDropdownOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  icon?: string
  label: string
  options: SettingsDropdownOption[]
  modelValue: string
  /** Number of options visible before scrolling. When undefined, all options are shown. */
  visibleCount?: number
}>(), {
  icon: undefined,
  visibleCount: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)

const selectedLabel = computed(() =>
  props.options.find(o => o.value === props.modelValue)?.label ?? props.modelValue,
)

const ROW_HEIGHT = 40

const isScrollable = computed(() =>
  !!props.visibleCount && props.options.length > props.visibleCount,
)

const listStyle = computed(() => {
  if (!isScrollable.value) return {}
  return { maxHeight: `${props.visibleCount! * ROW_HEIGHT}px` }
})

const scrollRef = ref<HTMLElement | null>(null)
const showTopFade = ref(false)
const showBottomFade = ref(true)

function onScroll() {
  const el = scrollRef.value
  if (!el) return
  showTopFade.value = el.scrollTop > 4
  showBottomFade.value = el.scrollTop + el.clientHeight < el.scrollHeight - 4
}

watch(isOpen, (open) => {
  if (open) {
    nextTick(() => {
      showTopFade.value = false
      showBottomFade.value = isScrollable.value
      onScroll()
    })
  }
})

function select(value: string) {
  emit('update:modelValue', value)
  isOpen.value = false
}
</script>

<template>
  <div>
    <SettingsSectionRow clickable @click="isOpen = !isOpen">
      <template v-if="icon" #icon>
        <UIcon :name="icon" class="size-4 shrink-0 text-neutral-500" />
      </template>
      <template #label>{{ label }}</template>
      <template #trailing>
        <span class="flex items-center gap-1.5">
          {{ selectedLabel }}
          <UIcon
            name="i-heroicons-chevron-down-20-solid"
            class="size-4 shrink-0 text-neutral-400 transition-transform"
            :class="isOpen ? 'rotate-180' : ''"
          />
        </span>
      </template>
    </SettingsSectionRow>
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="isOpen" class="overflow-hidden">
        <div class="relative border-t border-neutral-200/90">
          <div
            v-if="isScrollable"
            class="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-neutral-50/80 to-transparent transition-opacity duration-150"
            :class="showTopFade ? 'opacity-100' : 'opacity-0'"
          />
          <div
            ref="scrollRef"
            class="bg-neutral-50/50 overflow-y-auto overscroll-contain scrollbar-hide"
            :style="listStyle"
            @scroll="onScroll"
          >
            <button
              v-for="opt in options"
              :key="opt.value"
              type="button"
              class="flex w-full items-center justify-between px-5 py-2.5 text-left text-body-md transition-colors hover:bg-neutral-100"
              :class="opt.value === modelValue ? 'font-medium text-neutral-950' : 'text-neutral-600'"
              @click="select(opt.value)"
            >
              <span>{{ opt.label }}</span>
              <UIcon
                v-if="opt.value === modelValue"
                name="i-heroicons-check-20-solid"
                class="size-4 shrink-0 text-neutral-950"
              />
            </button>
          </div>
          <div
            v-if="isScrollable"
            class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t from-neutral-50/80 to-transparent transition-opacity duration-150"
            :class="showBottomFade ? 'opacity-100' : 'opacity-0'"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>
