<script setup lang="ts">
import { computed } from 'vue'

// In-built general chat page. The sidebar's Chat tab opens chats here; the
// chat id keys GeneralChat so switching chats remounts a fresh Chat instance.
const route = useRoute()
const chatId = computed(() => route.params.id as string)
</script>

<template>
  <GeneralChat :key="chatId" :chat-id="chatId" />
</template>
