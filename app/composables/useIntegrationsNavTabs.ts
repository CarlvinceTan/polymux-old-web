export function useIntegrationsNavTabs() {
  const { t } = useI18n()
  const headerTabs = computed(() => ({
    [t('integrations.installed')]: '/integrations/installed',
    [t('integrations.marketplace')]: '/integrations/marketplace',
    [t('integrations.publish')]: '/integrations/publish',
  } as Record<string, string>))
  return { headerTabs }
}
