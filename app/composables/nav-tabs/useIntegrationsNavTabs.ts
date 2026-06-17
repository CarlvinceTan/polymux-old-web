export function useIntegrationsNavTabs() {
  return useNavTabs('integrations', [
    { i18nKey: 'integrations.installed', path: '/integrations/installed' },
    { i18nKey: 'integrations.marketplace', path: '/integrations/marketplace' },
    { i18nKey: 'integrations.publish', path: '/integrations/publish' },
  ])
}
