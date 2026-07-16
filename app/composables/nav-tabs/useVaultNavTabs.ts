// The Files section (formerly "Vault"). Credentials and Wallet are now their own
// top-level sidebar nav items, so they are no longer tabs here — only the file
// browser and storage settings remain. The section's DB metadata key stays
// 'vault' (target_section), but the routes are now top-level `/files*`.
export function useVaultNavTabs() {
  return useNavTabs('vault', [
    { i18nKey: 'vault.tabs.files', path: '/files' },
    { i18nKey: 'vault.tabs.settings', path: '/files/settings' },
  ])
}
