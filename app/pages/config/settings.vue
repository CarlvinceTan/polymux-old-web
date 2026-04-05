<script setup lang="ts">
const headerTabs = {
  Profile: '/config/profile',
  Settings: '/config/settings',
} as const satisfies Record<string, string>
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2">
    <header class="shrink-0">
      <PageHeader :tabs="headerTabs" />
    </header>
    <div class="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <TabPanel class="min-h-0 min-w-0 flex-1">
        <div
          class="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-5 lg:gap-8"
        >
          <SettingsSection title="General">
            <SettingsSectionRow>
              <template #icon>
                <UIcon
                  name="i-heroicons-language-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>Language</template>
              <template #trailing>English</template>
            </SettingsSectionRow>
          </SettingsSection>

          <SettingsSection title="Notifications">
            <SettingsSectionRow>
              <template #icon>
                <UIcon
                  name="i-heroicons-envelope-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>Email</template>
              <template #trailing>On</template>
            </SettingsSectionRow>
            <SettingsSectionRow>
              <template #icon>
                <UIcon
                  name="i-heroicons-bell-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>Push</template>
              <template #trailing>Off</template>
            </SettingsSectionRow>
            <SettingsSectionRow>
              <template #icon>
                <UIcon
                  name="i-heroicons-megaphone-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>Product updates</template>
              <template #trailing>On</template>
            </SettingsSectionRow>
          </SettingsSection>

          <SettingsSection title="Other">
            <SettingsSectionRow>
              <template #icon>
                <UIcon
                  name="i-heroicons-document-text-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>Terms and conditions</template>
              <template #trailing>View</template>
            </SettingsSectionRow>
            <SettingsSectionRow>
              <template #icon>
                <UIcon
                  name="i-heroicons-shield-check-20-solid"
                  class="size-4 shrink-0 text-neutral-500"
                />
              </template>
              <template #label>Privacy policy</template>
              <template #trailing>View</template>
            </SettingsSectionRow>
          </SettingsSection>
        </div>
        <div class="h-4 w-full shrink-0 sm:h-5" aria-hidden="true" />
      </TabPanel>
    </div>
  </div>
</template>
