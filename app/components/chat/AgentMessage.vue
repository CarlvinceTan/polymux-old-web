<script setup lang="ts">
import { marked } from 'marked'

const { t } = useI18n()
const { copy, copied } = useClipboard()
const router = useRouter()
const route = useRoute()

const props = defineProps<{
  text: string
  showActions?: boolean
  /** Persisted-row id for this assistant bubble. Required to attach feedback;
   *  when absent the thumbs buttons stay inert (the bubble is mid-stream and
   *  hasn't been written to the database yet). */
  messageId?: string
  /** Current rating for this bubble from the calling user, or null when none.
   *  The two thumbs are mutually exclusive — only one can be active at a time. */
  feedback?: 'up' | 'down' | null
}>()

const emit = defineEmits<{
  /** Toggle the rating: emits null when the user clicks the currently-active
   *  thumb (clearing it), otherwise emits the new rating. The parent persists. */
  'feedback-change': [messageId: string, rating: 'up' | 'down' | null]
}>()

const renderer = new marked.Renderer()
const defaultTableRenderer = renderer.table.bind(renderer)
renderer.table = function (token) {
  return `<div class="table-scroll">${defaultTableRenderer(token)}</div>`
}

// Code blocks render Claude.ai-style: language label sits at the top-left of
// the dark code surface (no separator/header band), and the copy button floats
// in the top-right — hidden until the block is hovered or focused, with a
// tooltip that toggles between Copy and Copied. The button is wired through
// event delegation on the prose container (see onProseClick below), which
// works around the fact that v-html strips Vue's @click bindings.
const copyIconSvg ='<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12.5 3A1.5 1.5 0 0 1 14 4.5V6h1.5A1.5 1.5 0 0 1 17 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 15.5V14H4.5A1.5 1.5 0 0 1 3 12.5v-8A1.5 1.5 0 0 1 4.5 3zm1.5 9.5a1.5 1.5 0 0 1-1.5 1.5H7v1.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5H14zM4.5 4a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5z"/></svg>'
const checkIconSvg = '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15.188 5.11a.5.5 0 0 1 .752.626l-.056.084-7.5 9a.5.5 0 0 1-.738.033l-3.5-3.5-.064-.078a.501.501 0 0 1 .693-.693l.078.064 3.113 3.113 7.15-8.58z"/></svg>'

// Inline reference chips. The agent emits markdown links with a polymux://
// scheme — file/folder/artifact — and we render them as clickable pills that
// route to the right surface page. The link must be emitted as raw HTML
// because marked output is inserted with v-html and Vue components can't be
// instantiated inside that path; click handling is delegated through
// onProseClick the same way the code-block copy button is wired.
const fileIconSvg = '<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Z" clip-rule="evenodd"/></svg>'
const folderIconSvg = '<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75Z"/></svg>'
const artifactIconSvg = '<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0l-2.97 2.97ZM12 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clip-rule="evenodd"/></svg>'

type RefKind = 'file' | 'folder' | 'artifact'

function parsePolymuxRef(href: string): { kind: RefKind, id: string } | null {
  const prefix = 'polymux://'
  if (!href.startsWith(prefix)) return null
  const rest = href.slice(prefix.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const kind = rest.slice(0, slash)
  const id = rest.slice(slash + 1)
  if (!id) return null
  if (kind !== 'file' && kind !== 'folder' && kind !== 'artifact') return null
  return { kind, id }
}

function refIconSvg(kind: RefKind): string {
  if (kind === 'folder') return folderIconSvg
  if (kind === 'artifact') return artifactIconSvg
  return fileIconSvg
}

const defaultLinkRenderer = renderer.link.bind(renderer)
renderer.link = function (token) {
  const ref = parsePolymuxRef(token.href || '')
  if (!ref) return defaultLinkRenderer(token)
  // The link `text` token may itself be parsed markdown (e.g. bold inside a
  // link). Strip to plain text for the chip label — chips are intentionally
  // single-line and shouldn't carry inline formatting.
  const labelText = (token.text || ref.id).trim() || ref.id
  const label = escapeHtmlBody(labelText)
  const titleKey = ref.kind === 'folder'
    ? t('chat.openFolderRef')
    : ref.kind === 'artifact'
      ? t('chat.openArtifactRef')
      : t('chat.openFileRef')
  return `<span class="polymux-ref-chip" role="link" tabindex="0" data-ref-kind="${escapeAttr(ref.kind)}" data-ref-id="${escapeAttr(ref.id)}" title="${escapeAttr(titleKey)}"><span class="polymux-ref-chip-icon" aria-hidden="true">${refIconSvg(ref.kind)}</span><span class="polymux-ref-chip-label">${label}</span></span>`
}

renderer.code = function ({ text, lang, escaped }) {
  const language = (lang || '').trim().split(/\s+/)[0] || 'plaintext'
  const codeBody = escaped ? text : escapeHtmlBody(text)
  const copyTooltip = escapeAttr(t('common.copy'))
  const copiedTooltip = escapeAttr(t('chat.codeCopied'))
  const copyAria = escapeAttr(t('chat.copyToClipboard'))
  const copyBtn = `<button type="button" class="agent-codeblock-copy" aria-label="${copyAria}"><span class="agent-codeblock-tooltip" aria-hidden="true"><span class="agent-codeblock-tooltip-label agent-codeblock-tooltip-label--copy">${copyTooltip}</span><span class="agent-codeblock-tooltip-label agent-codeblock-tooltip-label--copied">${copiedTooltip}</span></span><span class="agent-codeblock-copy-icon agent-codeblock-copy-icon--copy">${copyIconSvg}</span><span class="agent-codeblock-copy-icon agent-codeblock-copy-icon--copied">${checkIconSvg}</span></button>`
  return `<div class="agent-codeblock" role="group" aria-label="${escapeAttr(language)} code" tabindex="0"><div class="agent-codeblock-header"><span class="agent-codeblock-lang">${escapeAttr(language)}</span>${copyBtn}</div><div class="agent-codeblock-scroll"><pre><code class="language-${escapeAttr(language)}">${codeBody}</code></pre></div></div>`
}

// Progressive reveal: even when WS chunks arrive in bursts (network packing,
// fast LLM bursts), paint the new characters in over a few frames so the
// bubble visibly streams instead of snapping to a complete chunk. The
// reveal cursor only catches up; it never holds back data the model has
// already produced — the underlying `text` prop is always the full target.
const revealedLen = ref(0)
let prevText = ''
let initialised = false
let rafId: number | null = null
let lastFrame = 0
// ~24 chars/frame at 60fps ≈ 1500 chars/sec. Faster than typical reading
// pace but slow enough that a 200-char burst still paints in over ~8 frames.
const CHARS_PER_MS = 0.4

function step(now: number) {
  rafId = null
  if (lastFrame === 0) lastFrame = now
  const elapsed = now - lastFrame
  lastFrame = now
  const target = props.text.length
  if (revealedLen.value >= target) return
  const advance = Math.max(1, Math.ceil(elapsed * CHARS_PER_MS))
  revealedLen.value = Math.min(target, revealedLen.value + advance)
  if (revealedLen.value < target) {
    rafId = requestAnimationFrame(step)
  }
}

function ensureTicking() {
  if (rafId !== null || revealedLen.value >= props.text.length) return
  if (typeof requestAnimationFrame !== 'function') {
    revealedLen.value = props.text.length
    return
  }
  lastFrame = 0
  rafId = requestAnimationFrame(step)
}

watch(() => props.text, (next) => {
  // First paint: snap so rehydrated history (or a fresh bubble's first chunk,
  // which is typically a few characters) doesn't typewriter through pre-existing
  // content. Subsequent extensions are what get the reveal treatment.
  if (!initialised) {
    revealedLen.value = next.length
    prevText = next
    initialised = true
    return
  }
  const isExtension = next.startsWith(prevText) && next.length > prevText.length
  prevText = next
  if (!isExtension) {
    // Replacement (retry navigation, edit) or shrink — snap to the new text.
    revealedLen.value = next.length
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    return
  }
  ensureTicking()
}, { immediate: true })

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
})

const visibleText = computed(() => props.text.slice(0, revealedLen.value))

function renderMarkdown(text: string): string {
  return marked.parse(text, { renderer }) as string
}

const thumbUpIcon = computed(() =>
  props.feedback === 'up' ? 'i-heroicons-hand-thumb-up-solid' : 'i-heroicons-hand-thumb-up',
)
const thumbDownIcon = computed(() =>
  props.feedback === 'down' ? 'i-heroicons-hand-thumb-down-solid' : 'i-heroicons-hand-thumb-down',
)

// Mutually-exclusive toggle: clicking the currently-active thumb clears the
// rating; clicking the opposite thumb switches sides (one POST, the parent's
// upsert handles the flip without a separate DELETE). Inert until messageId
// is known — a still-streaming bubble has no row to rate yet.
function onThumb(rating: 'up' | 'down') {
  if (!props.messageId) return
  const next = props.feedback === rating ? null : rating
  emit('feedback-change', props.messageId, next)
}

// Per-block copy: each code block carries its own .is-copied flash so two
// blocks side-by-side don't fight over a single shared "Copied" state.
// The same delegated handler routes polymux-ref chip clicks to the storage
// or artifact surface page — both are emitted as raw HTML from the marked
// renderer (chips and the codeblock copy button) so v-html can't carry Vue
// @click bindings.
function onProseClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null

  const chip = target?.closest('.polymux-ref-chip') as HTMLElement | null
  if (chip) {
    event.preventDefault()
    const kind = chip.getAttribute('data-ref-kind') as RefKind | null
    const id = chip.getAttribute('data-ref-id')
    if (!kind || !id) return
    void navigateRef(kind, id)
    return
  }

  const btn = target?.closest('.agent-codeblock-copy') as HTMLButtonElement | null
  if (!btn) return
  const block = btn.closest('.agent-codeblock')
  const codeEl = block?.querySelector('pre code') as HTMLElement | null
  const value = codeEl?.textContent ?? ''
  if (!value) return
  const flash = () => {
    btn.classList.add('is-copied')
    window.setTimeout(() => btn.classList.remove('is-copied'), 1400)
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(flash).catch(() => {})
  } else {
    flash()
  }
}

// Enter / Space activates a focused chip — required for the role="link"
// semantics since the chip is a <span>, not a native link.
function onProseKey(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.target as HTMLElement | null
  const chip = target?.closest('.polymux-ref-chip') as HTMLElement | null
  if (!chip) return
  event.preventDefault()
  const kind = chip.getAttribute('data-ref-kind') as RefKind | null
  const id = chip.getAttribute('data-ref-id')
  if (!kind || !id) return
  void navigateRef(kind, id)
}

async function navigateRef(kind: RefKind, id: string) {
  if (kind === 'artifact') {
    // Chat only renders inside /workflow/<id>/agent, so the workflow id lives
    // on the current route — no need to encode it in the polymux:// URL.
    const workflowId = String(route.params.id || '')
    if (!workflowId) return
    await router.push({ path: `/workflow/${workflowId}/artifacts`, query: { artifact: id } })
    return
  }
  // file / folder: storage/files paints the FileBrowser at the requested path.
  // For files, we pass the full path; the page splits it into the parent
  // directory + selected filename. For folders, the whole path is the dir.
  await router.push({ path: '/storage/files', query: { path: id, kind } })
}
</script>

<template>
  <div class="group w-full min-w-0">
    <div class="agent-prose text-sm leading-relaxed text-neutral-700" v-html="renderMarkdown(visibleText)" @click="onProseClick" @keydown="onProseKey" />
    <div
      v-if="showActions"
      class="mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
    >
      <MessageAction :icon="copied ? 'i-heroicons-check' : 'i-heroicons-square-2-stack'" :label="t('common.copy')" @click="copy(props.text)" />
      <MessageAction
        :icon="thumbUpIcon"
        :label="t('chat.goodResponse')"
        :active="feedback === 'up'"
        @click="onThumb('up')"
      />
      <MessageAction
        :icon="thumbDownIcon"
        :label="t('chat.badResponse')"
        :active="feedback === 'down'"
        @click="onThumb('down')"
      />
    </div>
  </div>
</template>

<style scoped>
.agent-prose :deep(p) {
  margin: 0 0 0.6em;
}
.agent-prose :deep(p:last-child) {
  margin-bottom: 0;
}
.agent-prose :deep(h1),
.agent-prose :deep(h2),
.agent-prose :deep(h3),
.agent-prose :deep(h4) {
  font-weight: 600;
  line-height: 1.3;
  margin: 1em 0 0.4em;
  color: #171717;
}
.agent-prose :deep(h1) { font-size: 1.2em; }
.agent-prose :deep(h2) { font-size: 1.1em; }
.agent-prose :deep(h3) { font-size: 1em; }
.agent-prose :deep(ul) {
  margin: 0.5em 0;
  padding-left: 1.4em;
  list-style-type: disc;
}
.agent-prose :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
  list-style-type: decimal;
}
.agent-prose :deep(ul ul) { list-style-type: circle; }
.agent-prose :deep(ul ul ul) { list-style-type: square; }
.agent-prose :deep(li) {
  margin: 0.2em 0;
}
.agent-prose :deep(code) {
  font-family: 'JetBrainsMono Nerd Font', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
  font-size: 0.85em;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 0.1em 0.35em;
}
.agent-prose :deep(pre) {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.85em 1em;
  overflow-x: auto;
  margin: 0.6em 0;
}
.agent-prose :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.82em;
}

/* Code blocks: thin header row with language label (left) and bare copy icon
   (right) on the same surface colour as the code — no grey band. */
.agent-prose :deep(.agent-codeblock) {
  position: relative;
  margin: 0.6em 0;
  background: var(--color-surface-container-low, #f3f3f3);
  border: 1px solid var(--color-outline-variant, #c6c6c6);
  border-radius: 10px;
  color: var(--color-on-surface, #1a1c1c);
}
.agent-prose :deep(.agent-codeblock:focus) {
  outline: none;
}
.agent-prose :deep(.agent-codeblock:focus-visible) {
  outline: 2px solid rgba(26, 28, 28, 0.35);
  outline-offset: 1px;
}

/* Header row: language left, copy right. Same background, no border-bottom. */
.agent-prose :deep(.agent-codeblock-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5em 0.7em 0 0.825em;
}
.agent-prose :deep(.agent-codeblock-lang) {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 0.7em;
  line-height: 1;
  color: var(--color-secondary, #5e5e5e);
  text-transform: lowercase;
  letter-spacing: 0.02em;
  user-select: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-prose :deep(.agent-codeblock-scroll) {
  overflow-x: auto;
  border-radius: 0 0 10px 10px;
}
.agent-prose :deep(.agent-codeblock pre) {
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0.5em 0.85em 0.8em;
}
.agent-prose :deep(.agent-codeblock pre code) {
  background: transparent;
  border: none;
  padding: 0;
  color: var(--color-on-surface, #1a1c1c);
  font-family: 'JetBrainsMono Nerd Font', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
}

/* Bare copy icon — no background, no border, just the SVG. */
.agent-prose :deep(.agent-codeblock-copy) {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.15em;
  background: none;
  border: none;
  color: var(--color-secondary, #5e5e5e);
  cursor: pointer;
  font: inherit;
  opacity: 0;
  transition: opacity 150ms ease, color 150ms ease;
}
.agent-prose :deep(.agent-codeblock:hover .agent-codeblock-copy),
.agent-prose :deep(.agent-codeblock:focus-within .agent-codeblock-copy) {
  opacity: 1;
}
.agent-prose :deep(.agent-codeblock-copy:hover) {
  color: var(--color-on-surface, #1a1c1c);
}
.agent-prose :deep(.agent-codeblock-copy:focus-visible) {
  outline: 2px solid rgba(26, 28, 28, 0.35);
  outline-offset: 1px;
  opacity: 1;
}
.agent-prose :deep(.agent-codeblock-copy svg) {
  width: 1.15em;
  height: 1.15em;
  display: block;
}
.agent-prose :deep(.agent-codeblock-copy-icon--copied) {
  display: none;
  color: #16a34a;
}
.agent-prose :deep(.agent-codeblock-copy.is-copied .agent-codeblock-copy-icon--copy) {
  display: none;
}
.agent-prose :deep(.agent-codeblock-copy.is-copied .agent-codeblock-copy-icon--copied) {
  display: inline-flex;
}

/* Tooltip on the copy button. Kept dark so it reads cleanly against the
   light page; matches the primary token used elsewhere in the design
   system (e.g. solid primary buttons). */
.agent-prose :deep(.agent-codeblock-tooltip) {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  padding: 0.3em 0.55em;
  background: var(--color-primary, #000000);
  color: var(--color-on-primary, #ffffff);
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 0.7em;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  border-radius: 4px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity 120ms ease, transform 120ms ease;
}
.agent-prose :deep(.agent-codeblock-copy:hover .agent-codeblock-tooltip),
.agent-prose :deep(.agent-codeblock-copy:focus-visible .agent-codeblock-tooltip) {
  opacity: 1;
  transform: translateY(0);
}
.agent-prose :deep(.agent-codeblock-tooltip-label--copied) {
  display: none;
}
.agent-prose :deep(.agent-codeblock-copy.is-copied .agent-codeblock-tooltip-label--copy) {
  display: none;
}
.agent-prose :deep(.agent-codeblock-copy.is-copied .agent-codeblock-tooltip-label--copied) {
  display: inline;
}
.agent-prose :deep(blockquote) {
  border-left: 3px solid #d4d4d4;
  margin: 0.5em 0;
  padding-left: 0.9em;
  color: #525252;
}
.agent-prose :deep(a) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Inline polymux:// reference chip. Matches the FileAttachment pill so the
   visual language is consistent between user-attached files and agent
   references. */
.agent-prose :deep(.polymux-ref-chip) {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  vertical-align: baseline;
  max-width: 100%;
  height: 1.25rem;
  padding: 0 0.375rem;
  margin: 0 0.0625rem;
  background: #f5f5f5;
  color: #404040;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  transition: background-color 120ms ease;
}
.agent-prose :deep(.polymux-ref-chip:hover) {
  background: #e5e5e5;
}
.agent-prose :deep(.polymux-ref-chip:focus-visible) {
  outline: 2px solid rgba(26, 28, 28, 0.35);
  outline-offset: 1px;
}
.agent-prose :deep(.polymux-ref-chip-icon) {
  display: inline-flex;
  align-items: center;
  color: #a3a3a3;
  flex-shrink: 0;
}
.agent-prose :deep(.polymux-ref-chip-icon svg) {
  width: 0.75rem;
  height: 0.75rem;
  display: block;
}
.agent-prose :deep(.polymux-ref-chip-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-prose :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0.75em 0;
}
.agent-prose :deep(strong) { font-weight: 600; }
.agent-prose :deep(em) { font-style: italic; }

/* Tables */
.agent-prose :deep(.table-scroll) {
  overflow-x: auto;
  margin: 0.6em 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.agent-prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
  line-height: 1.45;
}
.agent-prose :deep(thead tr) {
  background: #f9fafb;
}
.agent-prose :deep(th) {
  font-weight: 600;
  color: #171717;
  text-align: left;
  padding: 0.5em 0.75em;
  border-bottom: 1.5px solid #e5e7eb;
  white-space: nowrap;
}
.agent-prose :deep(td) {
  padding: 0.45em 0.75em;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
}
.agent-prose :deep(tbody tr:last-child td) {
  border-bottom: none;
}
.agent-prose :deep(tbody tr:nth-child(even)) {
  background: #fafafa;
}
</style>
