export function useDashboardNavTabs() {
  const { t } = useI18n()
  const headerTabs = computed(() => ({
    [t('dashboard.console')]: '/dashboard/console',
  } as Record<string, string>))
  return { headerTabs }
}
