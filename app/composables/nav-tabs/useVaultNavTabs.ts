export function useVaultNavTabs() {
  return useNavTabs('vault', [
    { i18nKey: 'vault.tabs.accounts', path: '/vault/accounts' },
    { i18nKey: 'vault.tabs.wallet', path: '/vault/wallet' },
  ])
}
