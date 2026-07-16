export function useIntegrationsNavTabs() {
  return useNavTabs('integrations', [
    { i18nKey: 'integrations.browse', path: '/connections' },
    { i18nKey: 'integrations.publish', path: '/integrations/publish' },
  ])
}
