export function useDashboardNavTabs() {
  const { t } = useI18n()
  const headerTabs = computed(() => ({
    [t('dashboard.home')]: '/dashboard/home',
    [t('dashboard.team')]: '/dashboard/team',
    [t('dashboard.usage')]: '/dashboard/usage',
    [t('dashboard.settings')]: '/dashboard/settings',
  } as Record<string, string>))
  const dashboardNavSeparatorBeforePath = undefined
  return { headerTabs, dashboardNavSeparatorBeforePath }
}