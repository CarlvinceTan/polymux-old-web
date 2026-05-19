<script setup lang="ts">
import { getCurrentInstance, h, nextTick, onBeforeUnmount, onMounted, ref, render, watch } from 'vue'
import type { FileAttachmentState } from '~/composables/chat/useAttachments'
import type { ChatMessageAttachment } from '~/composables/types'
import FileAttachment from '~/components/chat/FileAttachment.vue'

/**
 * Inline chip editor: a contenteditable surface that interleaves user text
 * with file-attachment chips. Newly added attachments insert at the saved
 * caret position (or at the end if the editor isn't focused). Backspace/
 * Delete adjacent to a chip removes it via the same path as the chip's X
 * button. The editor owns inline order; on submit it walks its DOM to
 * produce `{ text, attachments[] }` where each attachment carries a
 * `position` (character offset) so display can render the same layout.
 */

const props = withDefaults(defineProps<{
  modelValue: string
  attachments?: FileAttachmentState[]
  placeholder?: string
  disabled?: boolean
  maxLines?: number
}>(), {
  attachments: () => [],
  placeholder: '',
  disabled: false,
  maxLines: 4,
})

const emit = defineEmits<{
  'update:modelValue': [text: string]
  submit: [text: string, attachments: ChatMessageAttachment[]]
  'remove-attachment': [id: string]
  focus: []
  blur: []
  'update:expanded': [value: boolean]
}>()

const editorRef = ref<HTMLDivElement | null>(null)

let savedRange: Range | null = null
let suppressInput = false
let lastEmittedText = props.modelValue
const isEmpty = ref(props.modelValue.length === 0 && props.attachments.length === 0)

// Capture the parent's appContext so chip subtrees we mount imperatively
// inherit i18n, theme, and the rest of the Nuxt plugin stack. Without this,
// the i18n helper inside FileAttachment throws on access.
const appContext = getCurrentInstance()?.appContext ?? null

function walkEditor(
  onText: (text: string) => void,
  onChip: (el: HTMLElement) => void,
) {
  const root = editorRef.value
  if (!root) return
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      onText(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.hasAttribute('data-chip')) {
      onChip(el)
      return
    }
    if (el.tagName === 'BR') {
      onText('\n')
      return
    }
    const isBlock = el.tagName === 'DIV' || el.tagName === 'P'
    for (const c of el.childNodes) walk(c)
    if (isBlock) onText('\n')
  }
  for (const c of root.childNodes) walk(c)
}

function getEditorText(): string {
  let text = ''
  walkEditor(s => { text += s }, () => {})
  if (text.endsWith('\n')) text = text.slice(0, -1)
  return text
}

function serializeForSubmit(): { text: string; attachments: ChatMessageAttachment[] } {
  let text = ''
  const out: ChatMessageAttachment[] = []
  walkEditor(
    s => { text += s },
    (el) => {
      const id = el.getAttribute('data-attachment-id') ?? ''
      const name = el.getAttribute('data-name') ?? ''
      const status = el.getAttribute('data-status') ?? 'done'
      if (id && status === 'done') {
        out.push({ id, name, position: text.length })
      }
    },
  )
  if (text.endsWith('\n')) text = text.slice(0, -1)
  return { text, attachments: out }
}

function findChip(localId: string): HTMLElement | null {
  const root = editorRef.value
  if (!root) return null
  return root.querySelector<HTMLElement>(`[data-chip][data-local-id="${CSS.escape(localId)}"]`)
}

function createChipElement(att: FileAttachmentState): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.setAttribute('data-chip', '')
  wrapper.setAttribute('data-local-id', att.localId)
  wrapper.setAttribute('contenteditable', 'false')
  // Chip height matches the editor's line-height, so `align-top` makes the
  // chip's top edge coincide with the line-box top edge — its visual centre
  // then lines up with the caret centre (vertical-align: middle would push
  // the chip down to text-baseline + half-x-height).
  wrapper.className = 'inline-flex align-top select-none mx-0.5'
  paintChip(wrapper, att)
  return wrapper
}

function paintChip(wrapper: HTMLElement, att: FileAttachmentState) {
  // Skip when every observable field is unchanged — deep watches on the
  // attachment list fire on every progress tick, and a re-render per chip
  // per tick is wasteful for N>1 uploads.
  const progressStr = String(att.progress)
  if (
    wrapper.getAttribute('data-attachment-id') === att.id
    && wrapper.getAttribute('data-status') === att.status
    && wrapper.getAttribute('data-name') === att.name
    && wrapper.getAttribute('data-progress') === progressStr
  ) return
  wrapper.setAttribute('data-attachment-id', att.id)
  wrapper.setAttribute('data-name', att.name)
  wrapper.setAttribute('data-status', att.status)
  wrapper.setAttribute('data-progress', progressStr)
  // Mount via h+render so the FileAttachment subtree inherits i18n and the
  // rest of the Nuxt plugin stack from the parent's appContext.
  const vnode = h(FileAttachment, {
    name: att.name,
    status: att.status,
    progress: att.progress,
    removable: true,
    onRemove: () => emit('remove-attachment', att.id),
  })
  if (appContext) vnode.appContext = appContext
  render(vnode, wrapper)
}

function unpaintChip(wrapper: HTMLElement) {
  render(null, wrapper)
}

function rememberSelection() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!editorRef.value?.contains(range.startContainer)) return
  savedRange = range.cloneRange()
}

function restoreSelection(): Range | null {
  if (!savedRange) return null
  const root = editorRef.value
  if (!root) return null
  if (!root.contains(savedRange.startContainer)) return null
  const sel = window.getSelection()
  if (!sel) return null
  sel.removeAllRanges()
  sel.addRange(savedRange)
  return savedRange
}

function focusEditor() {
  editorRef.value?.focus()
}

function placeCursorAtEnd() {
  const root = editorRef.value
  if (!root) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  const sel = window.getSelection()
  if (sel) {
    sel.removeAllRanges()
    sel.addRange(range)
  }
  savedRange = range.cloneRange()
}

function insertChipAtSelection(chipEl: HTMLElement) {
  const root = editorRef.value
  if (!root) return
  const range = restoreSelection()
  if (range && root.contains(range.startContainer)) {
    range.deleteContents()
    range.insertNode(chipEl)
    const after = document.createRange()
    after.setStartAfter(chipEl)
    after.collapse(true)
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(after)
    }
    savedRange = after.cloneRange()
  } else {
    root.appendChild(chipEl)
    placeCursorAtEnd()
  }
}

function syncEmptyState() {
  const root = editorRef.value
  if (!root) {
    isEmpty.value = true
    return
  }
  const hasChip = !!root.querySelector('[data-chip]')
  const text = getEditorText()
  isEmpty.value = !hasChip && text.length === 0
}

function syncFromText(next: string) {
  const root = editorRef.value
  if (!root) return
  if (suppressInput) return
  if (next === lastEmittedText) return
  // External text update path. We preserve chips: append the diff text if
  // the existing content is a prefix of the new value (the common case for
  // voice transcription, which only appends). Otherwise we replace the
  // text nodes and leave chips at the end — better than wiping them.
  const current = getEditorText()
  if (next.startsWith(current)) {
    const tail = next.slice(current.length)
    if (tail) root.appendChild(document.createTextNode(tail))
  } else {
    const chips: HTMLElement[] = []
    root.querySelectorAll<HTMLElement>('[data-chip]').forEach(el => chips.push(el))
    suppressInput = true
    // Detach chips before nuking innerHTML so the mounted FileAttachment
    // subtrees don't leak. innerHTML='' would orphan their root nodes.
    for (const c of chips) c.remove()
    root.innerHTML = ''
    if (next) root.appendChild(document.createTextNode(next))
    for (const c of chips) root.appendChild(c)
    suppressInput = false
  }
  lastEmittedText = next
  syncEmptyState()
}

function reconcileChips() {
  const root = editorRef.value
  if (!root) return
  const want = props.attachments
  const wantByLocal = new Map(want.map(a => [a.localId, a] as const))

  // Remove chips whose attachment is gone; update the rest in place so the
  // caret doesn't jump while uploads progress.
  const existing = Array.from(root.querySelectorAll<HTMLElement>('[data-chip]'))
  for (const el of existing) {
    const localId = el.getAttribute('data-local-id') ?? ''
    const att = wantByLocal.get(localId)
    if (!att) {
      unpaintChip(el)
      el.remove()
      continue
    }
    paintChip(el, att)
  }

  // Multi-file uploads insert in props order, so they appear in a consistent
  // sequence where the user clicked Attach.
  for (const att of want) {
    if (findChip(att.localId)) continue
    insertChipAtSelection(createChipElement(att))
  }
  syncEmptyState()
}

function onInput() {
  if (suppressInput) return
  const text = getEditorText()
  if (text !== lastEmittedText) {
    lastEmittedText = text
    emit('update:modelValue', text)
  }
  // Browser-driven deletion (Backspace/Delete at a chip edge, selection-
  // delete crossing a chip) tears chips out of the DOM directly. Sync the
  // composable by emitting a remove for each attachment whose chip is gone.
  const root = editorRef.value
  if (root) {
    const present = new Set<string>()
    root.querySelectorAll<HTMLElement>('[data-chip]').forEach(el => {
      const lid = el.getAttribute('data-local-id') ?? ''
      if (lid) present.add(lid)
    })
    for (const att of props.attachments) {
      if (!present.has(att.localId)) emit('remove-attachment', att.id)
    }
  }
  updateExpandedState()
  syncEmptyState()
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    const { text, attachments } = serializeForSubmit()
    emit('submit', text, attachments)
  }
}

function onPaste(e: ClipboardEvent) {
  // Force plain-text paste so users can't smuggle HTML/images into the
  // editor; only chips and text are valid content.
  const text = e.clipboardData?.getData('text/plain') ?? ''
  if (!text) return
  e.preventDefault()
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  savedRange = range.cloneRange()
  onInput()
}

let selectionTracking = false

function onFocus() {
  if (!selectionTracking) {
    document.addEventListener('selectionchange', onSelectionChange)
    selectionTracking = true
  }
  emit('focus')
  rememberSelection()
}

function onBlur() {
  rememberSelection()
  if (selectionTracking) {
    document.removeEventListener('selectionchange', onSelectionChange)
    selectionTracking = false
  }
  emit('blur')
}

function onSelectionChange() {
  const root = editorRef.value
  if (!root) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  if (root.contains(sel.getRangeAt(0).startContainer)) {
    rememberSelection()
  }
}

const expanded = ref(false)
function updateExpandedState() {
  const root = editorRef.value
  if (!root) return
  const lh = Number.parseFloat(getComputedStyle(root).lineHeight)
  const linePx = Number.isFinite(lh) ? lh : 20
  const next = root.scrollHeight > linePx + 2
  if (next !== expanded.value) {
    expanded.value = next
    emit('update:expanded', next)
  }
}

function clearContent() {
  const root = editorRef.value
  if (!root) return
  suppressInput = true
  root.querySelectorAll<HTMLElement>('[data-chip]').forEach(unpaintChip)
  root.innerHTML = ''
  suppressInput = false
  lastEmittedText = ''
  savedRange = null
  syncEmptyState()
  updateExpandedState()
  emit('update:modelValue', '')
}

function submit() {
  const { text, attachments } = serializeForSubmit()
  emit('submit', text, attachments)
}

defineExpose({
  focus: focusEditor,
  clear: clearContent,
  rememberSelection,
  placeCursorAtEnd,
  submit,
})

watch(() => props.modelValue, (next) => {
  syncFromText(next)
  void nextTick(updateExpandedState)
})

watch(() => props.attachments, () => {
  reconcileChips()
  void nextTick(updateExpandedState)
}, { deep: true })

let chipRemovalObserver: MutationObserver | null = null

function startChipRemovalObserver() {
  const root = editorRef.value
  if (!root || chipRemovalObserver) return
  // Browsers remove `contenteditable=false` chip wrappers wholesale when the
  // user deletes them (Backspace/Delete or selection-delete crossing a
  // chip). We need to unmount their Vue subtrees so the render effects stop
  // before the wrapper is garbage-collected.
  chipRemovalObserver = new MutationObserver((records) => {
    for (const rec of records) {
      rec.removedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const el = node as HTMLElement
        if (el.hasAttribute?.('data-chip')) {
          unpaintChip(el)
          return
        }
        // Selection-delete may detach a subtree containing chips.
        el.querySelectorAll?.('[data-chip]').forEach(c => unpaintChip(c as HTMLElement))
      })
    }
  })
  chipRemovalObserver.observe(root, { childList: true, subtree: true })
}

function stopChipRemovalObserver() {
  chipRemovalObserver?.disconnect()
  chipRemovalObserver = null
}

onMounted(() => {
  const root = editorRef.value
  if (!root) return
  const text = props.modelValue
  // Edit-mode rehydration: seeded attachments carry their original character
  // offsets so we rebuild the inline layout the user last saw. Attachments
  // missing a position pin to the end.
  for (const tok of interleaveAttachments(text, props.attachments ?? [])) {
    if (tok.kind === 'text') root.appendChild(document.createTextNode(tok.text))
    else root.appendChild(createChipElement(tok.att))
  }
  lastEmittedText = text
  syncEmptyState()
  updateExpandedState()
  startChipRemovalObserver()
})

onBeforeUnmount(() => {
  if (selectionTracking) {
    document.removeEventListener('selectionchange', onSelectionChange)
    selectionTracking = false
  }
  stopChipRemovalObserver()
  const root = editorRef.value
  if (root) root.querySelectorAll<HTMLElement>('[data-chip]').forEach(unpaintChip)
})
</script>

<template>
  <div class="relative w-full">
    <div
      ref="editorRef"
      class="inline-chip-editor scrollbar-hide w-full overflow-y-auto bg-transparent leading-normal text-on-surface focus:outline-none"
      :class="[
        disabled ? 'cursor-not-allowed opacity-50 pointer-events-none' : '',
      ]"
      :style="{ maxHeight: `calc(${maxLines} * 1.5em)` }"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-disabled="disabled || undefined"
      :data-empty="isEmpty || undefined"
      :data-placeholder="placeholder"
      @input="onInput"
      @keydown="onKeydown"
      @paste="onPaste"
      @focus="onFocus"
      @blur="onBlur"
    />
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

.inline-chip-editor {
  @apply text-body-md;
  word-break: break-word;
  white-space: pre-wrap;
}

/* Placeholder hides on focus so the caret lands at position 0 of the
   editable area instead of after the pseudo-element text. */
.inline-chip-editor[data-empty]:not(:focus)::before {
  content: attr(data-placeholder);
  color: var(--color-secondary);
  pointer-events: none;
  -webkit-user-modify: read-only;
  user-modify: read-only;
}
</style>
