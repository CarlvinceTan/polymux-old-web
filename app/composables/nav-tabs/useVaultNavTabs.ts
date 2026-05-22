import { useCustomTabs } from '~/composables/integrations/useCustomTabs'

export function useVaultNavTabs() {
  const { t } = useI18n()
  const { isEnabled } = useMeFeatures()
  const headerTabs = computed(() => {
    const tabs: Record<string, string> = {
      [t('vault.tabs.passwords')]: '/vault/passwords',
    }
    if (isEnabled('wallet')) {
      tabs[t('vault.tabs.wallet')] = '/vault/wallet'
    }
    return tabs
  })
  const { tabs: customTabs } = useCustomTabs('vault')
  return { headerTabs, customTabs }
}
