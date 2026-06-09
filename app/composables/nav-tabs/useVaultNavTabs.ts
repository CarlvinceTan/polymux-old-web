import { useCustomTabs } from '~/composables/integrations/useCustomTabs'

export function useVaultNavTabs() {
  const { t } = useI18n()
  const headerTabs = computed(() => ({
    [t('vault.tabs.accounts')]: '/vault/accounts',
    [t('vault.tabs.wallet')]: '/vault/wallet',
  }))
  const { tabs: customTabs } = useCustomTabs('vault')
  return { headerTabs, customTabs }
}
