export function useStorageNavTabs() {
  return useNavTabs('storage', [
    { i18nKey: 'storage.tabs.files', path: '/files' },
    { i18nKey: 'storage.tabs.settings', path: '/files/settings' },
  ])
}
