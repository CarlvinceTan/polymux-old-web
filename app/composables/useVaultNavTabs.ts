export function useVaultNavTabs() {
  const { t } = useI18n()
  const headerTabs = computed(() => ({
    [t('vault.tabs.passwords')]: '/vault/passwords',
    [t('vault.tabs.wallet')]: '/vault/wallet',
  } as Record<string, string>))
  return { headerTabs }
}
