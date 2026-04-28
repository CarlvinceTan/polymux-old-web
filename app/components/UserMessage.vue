<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { ChatMessageAttachment } from '~/composables/types'

const { t } = useI18n()
const { copy, copied } = useClipboard()

const props = defineProps<{
  text: string
  attachments?: ChatMessageAttachment[]
  sessionId: string
}>()

const emit = defineEmits<{
  edit: [text: string, attachments: ChatMessageAttachment[]]
}>()

const editing = ref(false)
const editText = ref('')
const editTextareaRef = ref<HTMLTextAreaElement | null>(null)
const editFileInputRef = ref<HTMLInputElement | null>(null)

const { attachments: editAttachments, addFiles, removeFile, clearAll, seed } = useAttachments()

function startEdit() {
  editText.value = props.text
  seed(props.attachments ?? [])
  editing.value = true
  nextTick(() => {
    const el = editTextareaRef.value
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
    el.focus()
  })
}

function cancelEdit() {
  editing.value = false
  clearAll()
}

function submitEdit() {
  const trimmed = editText.value.trim()
  const allAttachments = editAttachments.value
    .filter(a => a.status === 'done')
    .map(a => ({ id: a.id, name: a.name }))
  if (!trimmed && allAttachments.length === 0) return
  editing.value = false
  emit('edit', trimmed, allAttachments)
  clearAll()
}

function onRemoveEditFile(id: string) {
  removeFile(id, props.sessionId)
}

function onEditAttachClick() {
  editFileInputRef.value?.click()
}

function onEditFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  addFiles(props.sessionId, input.files)
  input.value = ''
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (e.isComposing) return
  e.preventDefault()
  submitEdit()
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}

let enterQueue: HTMLElement[] = []
let enterFlush: ReturnType<typeof setTimeout> | undefined

function onChipBeforeEnter(el: Element) {
  ;(el as HTMLElement).style.opacity = '0'
}

function onChipEnter(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  const order = enterQueue.length
  enterQueue.push(htmlEl)

  clearTimeout(enterFlush)
  enterFlush = setTimeout(() => {
    const batch = enterQueue
    enterQueue = []
    batch.forEach((item, i) => {
      const delay = batch.length > 1 ? i * 50 : 0
      item.style.transition = `opacity 0.15s ease ${delay}ms`
      requestAnimationFrame(() => { item.style.opacity = '1' })
    })
  }, 0)

  const maxDelay = (order + 1) * 50
  setTimeout(done, 150 + maxDelay)
}

function onChipAfterEnter(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.transition = ''
  htmlEl.style.opacity = ''
}

function onChipBeforeLeave(el: Element) {
  const htmlEl = el as HTMLElement
  const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = htmlEl
  htmlEl.style.left = `${offsetLeft}px`
  htmlEl.style.top = `${offsetTop}px`
  htmlEl.style.width = `${offsetWidth}px`
  htmlEl.style.height = `${offsetHeight}px`
}
</script>

<template>
  <div
    class="group ml-auto flex max-w-[min(100%,28rem)] flex-col items-end gap-0"
    :class="editing ? 'w-full' : 'w-fit'"
  >
    <!-- Edit mode -->
    <div v-if="editing" class="mb-6 w-full rounded-[1.25rem] border border-neutral-300 bg-white px-3 py-2">
      <input
        ref="editFileInputRef"
        type="file"
        multiple
        class="absolute h-0 w-0 overflow-hidden opacity-0"
        tabindex="-1"
        aria-hidden="true"
        @change="onEditFileChange"
      >
      <textarea
        ref="editTextareaRef"
        v-model="editText"
        rows="1"
        name="message-edit"
        class="w-full resize-none bg-transparent text-sm leading-relaxed text-neutral-800 outline-none"
        @keydown="onEditKeydown"
        @input="autoResize"
      />
      <TransitionGroup
        v-if="editAttachments.length > 0"
        tag="div"
        name="chip"
        class="relative flex flex-wrap-reverse gap-1 pt-1.5"
        @before-enter="onChipBeforeEnter"
        @enter="onChipEnter"
        @after-enter="onChipAfterEnter"
        @before-leave="onChipBeforeLeave"
      >
        <FileAttachment
          v-for="file in editAttachments"
          :key="file.id"
          :name="file.name"
          :status="file.status"
          :progress="file.progress"
          removable
          @remove="onRemoveEditFile(file.id)"
        />
      </TransitionGroup>
      <div class="mt-2 flex items-center justify-between gap-1.5">
        <button
          type="button"
          class="flex items-center justify-center rounded-md p-1 text-secondary transition-opacity hover:opacity-70"
          :aria-label="t('common.attach')"
          @click="onEditAttachClick"
        >
          <UIcon name="i-heroicons-paper-clip-20-solid" class="size-[15px] shrink-0" />
        </button>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            @click="cancelEdit"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
            @click="submitEdit"
          >
            {{ t('common.send') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Display mode -->
    <template v-else>
      <div class="min-w-0 rounded-[1.25rem] bg-[#f4f4f4] px-3 py-1.5">
        <p class="m-0 text-left text-sm leading-relaxed text-neutral-800 break-words">{{ text }}</p>
        <div
          v-if="attachments && attachments.length > 0"
          class="flex flex-wrap gap-1 pt-1.5"
        >
          <FileAttachment
            v-for="file in attachments"
            :key="file.id"
            :name="file.name"
            :removable="false"
          />
        </div>
      </div>
      <div class="mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <MessageAction icon="i-heroicons-pencil-square-20-solid" :label="t('common.edit')" @click="startEdit" />
        <MessageAction :icon="copied ? 'i-heroicons-check' : 'i-heroicons-square-2-stack'" :label="t('common.copy')" @click="copy(text)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.chip-move {
  transition: transform 0.2s ease;
}
.chip-leave-active {
  transition: opacity 0.15s ease;
  position: absolute;
}
.chip-leave-to {
  opacity: 0;
}
</style>
