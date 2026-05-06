export function useWorkflowNavTabs(workflowId: Ref<string>) {
  const { t } = useI18n()
  const headerTabs = computed(() => {
    const base = `/workflow/${workflowId.value}`
    return {
      [t('workflow.tabs.agent')]: `${base}/agent`,
      [t('workflow.tabs.schedule')]: `${base}/schedule`,
      [t('workflow.tabs.artifacts')]: `${base}/artifacts`,
    } as Record<string, string>
  })
  return { headerTabs }
}
