import { useCustomTabs } from '~/composables/integrations/useCustomTabs'

export function useDashboardNavTabs() {
  const { t } = useI18n()
  const headerTabs = computed(() => ({
    [t('dashboard.console')]: '/dashboard/console',
  } as Record<string, string>))
  const { tabs: customTabs } = useCustomTabs('dashboard')
  return { headerTabs, customTabs }
}
