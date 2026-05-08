<script setup lang="ts">
type IntegrationType = 'webhook' | 'oauth' | 'tool'

interface CreatedIntegration {
  name: string
  type: IntegrationType
  scopes: string[]
  webhookUrl?: string
  apiKey: string
  apiSecret: string
}

const emit = defineEmits<{
  close: []
  created: [integration: CreatedIntegration]
}>()

const SCOPES = [
  'read:workflows',
  'write:workflows',
  'read:vault',
  'read:storage',
  'webhook:receive',
] as const

type Step = 1 | 2 | 3 | 4
const step = ref<Step>(1)

const name = ref('')
const type = ref<IntegrationType>('webhook')
const scopes = ref<string[]>(['read:workflows'])
const webhookUrl = ref('')

const generatedKey = ref('')
const generatedSecret = ref('')
const keyCopied = ref(false)
const secretCopied = ref(false)

const canAdvanceFromStep1 = computed(() => name.value.trim().length > 0)
const canAdvanceFromStep2 = computed(() => {
  if (scopes.value.length === 0) return false
  if (type.value === 'webhook' && !webhookUrl.value.trim()) return false
  return true
})

function randHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined') crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

function toggleScope(scope: string) {
  const i = scopes.value.indexOf(scope)
  if (i >= 0) scopes.value.splice(i, 1)
  else scopes.value.push(scope)
}

function next() {
  if (step.value === 1 && canAdvanceFromStep1.value) step.value = 2
  else if (step.value === 2 && canAdvanceFromStep2.value) step.value = 3
}

function back() {
  if (step.value > 1) step.value = (step.value - 1) as Step
}

function create() {
  generatedKey.value = `pk_live_${randHex(16)}`
  generatedSecret.value = `sk_live_${randHex(24)}`
  step.value = 4
  emit('created', {
    name: name.value.trim(),
    type: type.value,
    scopes: [...scopes.value],
    webhookUrl: type.value === 'webhook' ? webhookUrl.value.trim() : undefined,
    apiKey: generatedKey.value,
    apiSecret: generatedSecret.value,
  })
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(generatedKey.value)
    keyCopied.value = true
    setTimeout(() => { keyCopied.value = false }, 1800)
  }
  catch { /* clipboard unavailable */ }
}

async function copySecret() {
  try {
    await navigator.clipboard.writeText(generatedSecret.value)
    secretCopied.value = true
    setTimeout(() => { secretCopied.value = false }, 1800)
  }
  catch { /* clipboard unavailable */ }
}

const stepLabels: Record<Exclude<Step, 4>, string> = {
  1: 'Basics',
  2: 'Scopes & webhook',
  3: 'Confirm',
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="integration-builder-title"
  >
    <div class="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm" @click="emit('close')" />
    <div class="relative w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
      <div v-if="step !== 4" class="flex items-center gap-2 border-b border-neutral-200 px-6 py-4">
        <div
          v-for="n in [1, 2, 3] as const"
          :key="n"
          class="flex flex-1 items-center gap-2"
        >
          <span
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold"
            :class="step === n
              ? 'bg-neutral-950 text-white'
              : step > n
                ? 'bg-emerald-500 text-white'
                : 'bg-neutral-100 text-neutral-500'"
          >
            <UIcon v-if="step > n" name="i-heroicons-check-20-solid" class="size-3.5" />
            <span v-else>{{ n }}</span>
          </span>
          <span class="text-xs font-medium" :class="step === n ? 'text-neutral-950' : 'text-neutral-500'">
            {{ stepLabels[n] }}
          </span>
          <span v-if="n < 3" class="ml-2 hidden h-px flex-1 bg-neutral-200 sm:block" />
        </div>
      </div>

      <div v-if="step === 1" class="px-6 py-6">
        <h2 id="integration-builder-title" class="text-lg font-semibold text-neutral-950">
          Create a new integration
        </h2>
        <p class="mt-1 text-sm text-neutral-500">
          Start with a name and a type. You can change scopes later.
        </p>

        <div class="mt-6 space-y-5">
          <label class="block">
            <span class="block text-sm font-medium text-neutral-800">Name</span>
            <input
              v-model="name"
              type="text"
              placeholder="My Slack notifier"
              class="mt-1.5 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 transition-colors focus:border-neutral-500 focus:outline-none"
            >
          </label>

          <fieldset>
            <legend class="block text-sm font-medium text-neutral-800">Type</legend>
            <div class="mt-1.5 grid grid-cols-3 gap-2">
              <label
                v-for="t in (['webhook', 'oauth', 'tool'] as IntegrationType[])"
                :key="t"
                class="cursor-pointer rounded-md border px-3 py-2.5 text-center text-sm font-medium transition-colors"
                :class="type === t
                  ? 'border-neutral-950 bg-neutral-950 text-white'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'"
              >
                <input v-model="type" type="radio" :value="t" class="sr-only">
                {{ t }}
              </label>
            </div>
          </fieldset>
        </div>
      </div>

      <div v-else-if="step === 2" class="px-6 py-6">
        <h2 class="text-lg font-semibold text-neutral-950">
          Pick scopes
        </h2>
        <p class="mt-1 text-sm text-neutral-500">
          Choose what your integration can read and write.
        </p>

        <fieldset class="mt-6 space-y-2">
          <legend class="sr-only">OAuth scopes</legend>
          <label
            v-for="scope in SCOPES"
            :key="scope"
            class="flex cursor-pointer items-center gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2.5 transition-colors hover:border-neutral-300"
          >
            <input
              type="checkbox"
              :checked="scopes.includes(scope)"
              class="size-4 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950"
              @change="toggleScope(scope)"
            >
            <code class="font-mono text-sm text-neutral-800">{{ scope }}</code>
          </label>
        </fieldset>

        <label v-if="type === 'webhook'" class="mt-5 block">
          <span class="block text-sm font-medium text-neutral-800">Webhook URL</span>
          <input
            v-model="webhookUrl"
            type="url"
            placeholder="https://example.com/polymux/hook"
            class="mt-1.5 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-neutral-900 placeholder-neutral-400 transition-colors focus:border-neutral-500 focus:outline-none"
          >
        </label>
      </div>

      <div v-else-if="step === 3" class="px-6 py-6">
        <h2 class="text-lg font-semibold text-neutral-950">
          Review and create
        </h2>
        <p class="mt-1 text-sm text-neutral-500">
          Double-check before generating keys. You can rotate them later.
        </p>

        <dl class="mt-6 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
          <div class="flex items-start justify-between gap-4 px-4 py-3">
            <dt class="text-sm font-medium text-neutral-500">Name</dt>
            <dd class="text-sm text-neutral-900">{{ name }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4 px-4 py-3">
            <dt class="text-sm font-medium text-neutral-500">Type</dt>
            <dd class="text-sm text-neutral-900">{{ type }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4 px-4 py-3">
            <dt class="text-sm font-medium text-neutral-500">Scopes</dt>
            <dd class="flex flex-wrap justify-end gap-1.5">
              <code v-for="s in scopes" :key="s" class="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-800">
                {{ s }}
              </code>
            </dd>
          </div>
          <div v-if="type === 'webhook'" class="flex items-start justify-between gap-4 px-4 py-3">
            <dt class="text-sm font-medium text-neutral-500">Webhook URL</dt>
            <dd class="truncate font-mono text-xs text-neutral-700">{{ webhookUrl }}</dd>
          </div>
        </dl>
      </div>

      <div v-else class="px-6 py-6">
        <div class="flex items-center gap-3">
          <span class="inline-flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <UIcon name="i-heroicons-check-20-solid" class="size-5" />
          </span>
          <div>
            <h2 class="text-lg font-semibold text-neutral-950">
              Integration created
            </h2>
            <p class="text-sm text-neutral-500">
              Copy these now. The signing secret will not be shown again.
            </p>
          </div>
        </div>

        <div class="mt-6 space-y-4">
          <div class="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium uppercase tracking-wider text-neutral-500">Publishable key</span>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-950"
                @click="copyKey"
              >
                <UIcon :name="keyCopied ? 'i-heroicons-check-20-solid' : 'i-heroicons-clipboard-document-20-solid'" class="size-4" />
                {{ keyCopied ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <code class="mt-2 block break-all font-mono text-sm text-neutral-900">{{ generatedKey }}</code>
          </div>

          <div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium uppercase tracking-wider text-amber-700">Signing secret</span>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-950"
                @click="copySecret"
              >
                <UIcon :name="secretCopied ? 'i-heroicons-check-20-solid' : 'i-heroicons-clipboard-document-20-solid'" class="size-4" />
                {{ secretCopied ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <code class="mt-2 block break-all font-mono text-sm text-amber-900">{{ generatedSecret }}</code>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-6 py-4">
        <button
          v-if="step !== 4"
          type="button"
          class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800"
          @click="step === 1 ? emit('close') : back()"
        >
          {{ step === 1 ? 'Cancel' : 'Back' }}
        </button>
        <span v-else class="text-xs text-neutral-500">
          Stored in your Vault.
        </span>

        <button
          v-if="step === 1"
          type="button"
          :disabled="!canAdvanceFromStep1"
          class="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          @click="next"
        >
          Next
          <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
        </button>
        <button
          v-else-if="step === 2"
          type="button"
          :disabled="!canAdvanceFromStep2"
          class="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          @click="next"
        >
          Next
          <UIcon name="i-heroicons-arrow-right-20-solid" class="size-4" />
        </button>
        <button
          v-else-if="step === 3"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          @click="create"
        >
          Create integration
          <UIcon name="i-heroicons-rocket-launch-20-solid" class="size-4" />
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          @click="emit('close')"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
