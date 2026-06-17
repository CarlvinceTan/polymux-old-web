export function useDashboardNavTabs() {
  return useNavTabs('dashboard', [
    { i18nKey: 'dashboard.console', path: '/dashboard/console' },
  ])
}
