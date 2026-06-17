import { useCustomTabs } from '~/composables/integrations/useCustomTabs'
import type { LayoutTargetSection } from '~~/server/utils/integrations/layoutSections'

export interface NavTabEntry {
  /** i18n key resolved at render time so labels react to locale changes. */
  i18nKey: string
  path: string
}

/**
 * Shared factory for the section nav-tabs composables. Builds the
 * `{ label: path }` header map inside a computed (keeping it locale-reactive)
 * and wires up the section's custom (user-installed) tabs.
 */
export function useNavTabs(section: LayoutTargetSection, entries: NavTabEntry[]) {
  const { t } = useI18n()
  const headerTabs = computed(
    () => Object.fromEntries(entries.map((e) => [t(e.i18nKey), e.path])) as Record<string, string>,
  )
  const { tabs: customTabs } = useCustomTabs(section)
  return { headerTabs, customTabs }
}
