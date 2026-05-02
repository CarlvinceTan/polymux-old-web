<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()

useHead({
  title: () => `${t('accountSuspendedTitle')} — Polymux`,
})

const supabase = useSupabaseClient()

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/sign-in', { replace: true })
}
</script>

<template>
  <main class="account-suspended">
    <section>
      <h1>{{ t('accountSuspendedTitle') }}</h1>
      <p>{{ t('accountSuspendedBody') }}</p>
      <button type="button" @click="signOut">
        {{ t('accountSuspendedSignOut') }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.account-suspended {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--color-bg, #0a0a0a);
}
section {
  max-width: 28rem;
  text-align: center;
  color: var(--color-text-primary, #eee);
}
h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}
p {
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--color-text-secondary, #aaa);
  margin-bottom: 1.5rem;
}
button {
  padding: 0.6rem 1.25rem;
  background: var(--color-bg-elev, #1a1a1a);
  color: var(--color-text-primary, #eee);
  border: 1px solid var(--color-line, #2a2a2a);
  cursor: pointer;
}
button:hover {
  background: var(--color-bg-elev-hover, #222);
}
</style>
