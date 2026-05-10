import type { Ref } from 'vue'
import type { SessionHandle } from '~/composables/auth/useSession'

// Binds the session-level `workflow_saved` / `workflow_save_rejected` /
// `workflow_versions_truncated` listeners to the caller's reactive scope
// (typically the workflow page) so they fire regardless of which child view
// is mounted. Exposes a "save tick" other components (WorkflowDock) can
// watch to refresh their local step state.
export function useWorkflowAgentEvents(session: SessionHandle, workspaceId: Ref<string>) {
  const { workflows, fetchWorkflows, getWorkflow, fetchVersions } = useWorkflows()
  const { t } = useI18n()
  const toast = useAppToast()

  const lastSavedName = useState<string | null>('workflow-last-saved-name', () => null)
  const lastSavedAt = useState<number>('workflow-last-saved-at', () => 0)

  const onSaved = async (p: { name: string }) => {
    const ws = workspaceId.value
    if (!ws) return
    await fetchWorkflows(ws)
    const match = workflows.value.find(w => w.name === p.name)
    if (match) await getWorkflow(ws, match.id)
    lastSavedName.value = p.name
    lastSavedAt.value = Date.now()
  }

  const onRejected = (p: { name: string; reason: string }) => {
    toast.show(t('workflow.saveRejectedToast', { name: p.name, reason: p.reason }), 'warning', 6000)
  }

  // The server emits this after edit-resend has deleted workflow_versions
  // rows belonging to discarded turns. Refetch so the saved-workflow view
  // (latest version + version list) re-syncs with the truncated chat.
  // The in-memory draft tree refreshes automatically via the existing
  // `workflow_draft` channel (Rollback re-publishes), so we only refresh
  // persisted state here. Bumps lastSavedAt so any consumer watching for
  // saved-workflow churn (WorkflowDock) re-renders too.
  const onVersionsTruncated = async (p: { workflow_id: string; turn_ids: string[] }) => {
    const ws = workspaceId.value
    if (!ws || !p.workflow_id) return
    await Promise.all([
      getWorkflow(ws, p.workflow_id),
      fetchVersions(ws, p.workflow_id),
    ])
    lastSavedAt.value = Date.now()
  }

  session.on<{ name: string }>('workflow_saved', onSaved)
  session.on<{ name: string; reason: string }>('workflow_save_rejected', onRejected)
  session.on<{ workflow_id: string; turn_ids: string[] }>('workflow_versions_truncated', onVersionsTruncated)

  onScopeDispose(() => {
    session.off('workflow_saved', onSaved)
    session.off('workflow_save_rejected', onRejected)
    session.off('workflow_versions_truncated', onVersionsTruncated)
  })

  return { lastSavedName, lastSavedAt }
}
