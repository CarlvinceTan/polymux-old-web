export function useStorageNavTabs() {
  const { t } = useI18n()
  const headerTabs = computed(() => ({
    [t('storage.tabs.files')]: '/storage/files',
    [t('storage.tabs.settings')]: '/storage/settings',
  } as Record<string, string>))
  return { headerTabs }
}
