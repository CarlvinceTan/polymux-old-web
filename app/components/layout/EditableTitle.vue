<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const { t } = useI18n()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isEditing = ref(false)
const editingValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

function startEdit() {
  if (props.disabled) return
  isEditing.value = true
  editingValue.value = props.modelValue
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.select()
    }
  })
}

function confirm() {
  const value = editingValue.value.trim()
  editingValue.value = ''
  isEditing.value = false
  if (value) {
    emit('update:modelValue', value)
  }
}

function cancel() {
  isEditing.value = false
  editingValue.value = ''
}
</script>

<template>
  <input
    v-if="isEditing"
    ref="inputRef"
    v-model="editingValue"
    name="editable-title"
    class="min-w-0 w-full bg-transparent border-0 outline-none text-7xl font-extrabold leading-snug text-neutral-950 sm:text-panel-title"
    @keyup.enter="confirm"
    @keyup.esc="cancel"
    @blur="confirm"
  />
  <div v-else class="group/edit-title flex min-w-0 w-full items-center gap-2">
    <h2
      class="min-w-0 truncate text-7xl font-extrabold leading-snug text-neutral-950 sm:text-panel-title select-none"
      :class="!disabled ? 'cursor-text' : 'cursor-default'"
      :title="modelValue"
      @dblclick="startEdit"
    >
      {{ modelValue }}
    </h2>
    <!-- Hover affordance: pencil + "double-click to edit", small grey text. -->
    <span
      v-if="!disabled"
      class="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-400 opacity-0 transition-opacity duration-150 group-hover/edit-title:opacity-100"
      aria-hidden="true"
    >
      <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      {{ t('common.doubleClickToEdit') }}
    </span>
  </div>
</template>
