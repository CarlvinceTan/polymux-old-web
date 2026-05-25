<script setup lang="ts">
import { useUpgradePlanModal } from '~/composables/account/useUpgradePlanModal'

const { open, payload, dismiss } = useUpgradePlanModal()
</script>

<template>
  <UpgradePlanModal
    :open="open"
    :payload="payload"
    @dismiss="dismiss"
  />
</template>
