export function useStorageNavTabs() {
  return useNavTabs('storage', [
    { i18nKey: 'storage.tabs.files', path: '/storage/files' },
    { i18nKey: 'storage.tabs.settings', path: '/storage/settings' },
  ])
}
