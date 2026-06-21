export interface Wallet {
  id: string
  workspace_id: string
  balance_cents: number
  currency: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  wallet_id: string
  session_id: string | null
  type: 'top_up' | 'allocation' | 'deduction' | 'refund' | 'adjustment'
  amount_cents: number
  balance_after_cents: number
  description: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface SessionBudget {
  id: string
  wallet_id: string
  session_id: string
  allocated_cents: number
  spent_cents: number
  status: 'active' | 'paused' | 'exhausted' | 'released'
  created_at: string
  updated_at: string
}

export const CREDIT_PACKS = [
  { cents: 500, label: '$5' },
  { cents: 1000, label: '$10' },
  { cents: 2500, label: '$25' },
  { cents: 5000, label: '$50' },
  { cents: 10000, label: '$100' },
] as const

export type TransactionType = Transaction['type']
export type BudgetStatus = SessionBudget['status']

export function useWallet() {
  const { authFetch } = useAuthFetch()
  const { currentWorkspaceId } = useWorkspaces()
  const { isWalletEnabled } = useMeFeatures()
  const queryClient = useQueryClient()

  const wsId = computed(() => currentWorkspaceId.value)
  const walletFeatureEnabled = computed(() => isWalletEnabled())
  const queriesEnabled = computed(() => !!wsId.value && walletFeatureEnabled.value)

  const walletQuery = useQuery({
    queryKey: computed(() => ['wallet', wsId.value]),
    queryFn: async () => {
      const id = wsId.value
      if (!id) return null
      try {
        return await authFetch<Wallet>(`/workspaces/${id}/wallet`)
      } catch {
        return null
      }
    },
    enabled: queriesEnabled,
  })

  const transactionsQuery = useQuery({
    queryKey: computed(() => ['wallet-transactions', wsId.value]),
    queryFn: async () => {
      const id = wsId.value
      if (!id) return []
      try {
        return await authFetch<Transaction[]>(`/workspaces/${id}/wallet/transactions`)
      } catch {
        return []
      }
    },
    enabled: queriesEnabled,
  })

  const budgetsQuery = useQuery({
    queryKey: computed(() => ['wallet-budgets', wsId.value]),
    queryFn: async () => {
      const id = wsId.value
      if (!id) return []
      try {
        return await authFetch<SessionBudget[]>(`/workspaces/${id}/wallet/budgets`)
      } catch {
        return []
      }
    },
    enabled: queriesEnabled,
  })

  const wallet = computed(() => walletQuery.data.value ?? null)
  const transactions = computed(() => transactionsQuery.data.value ?? [])
  const budgets = computed(() => budgetsQuery.data.value ?? [])

  const loading = computed(() =>
    walletQuery.isFetching.value ||
    transactionsQuery.isFetching.value ||
    budgetsQuery.isFetching.value,
  )

  async function fetchWallet(opts?: { force?: boolean }) {
    const id = wsId.value
    if (!id) return
    if (opts?.force) {
      await queryClient.invalidateQueries({ queryKey: ['wallet', id] })
    } else {
      await queryClient.fetchQuery({ queryKey: ['wallet', id] })
    }
  }

  async function fetchTransactions(params?: { type?: TransactionType; sessionId?: string; force?: boolean }) {
    const id = wsId.value
    if (!id) return
    const isFiltered = !!(params?.type || params?.sessionId)
    if (isFiltered) {
      // Filtered queries are one-off fetches — write into the unfiltered cache
      // slot so the caller's reactive `transactions` ref updates.
      try {
        const query = new URLSearchParams()
        if (params?.type) query.set('type', params.type)
        if (params?.sessionId) query.set('session_id', params.sessionId)
        const qs = query.toString()
        const path = `/workspaces/${id}/wallet/transactions${qs ? `?${qs}` : ''}`
        const data = await authFetch<Transaction[]>(path)
        queryClient.setQueryData(['wallet-transactions', id], data)
      } catch {
        // leave existing cache intact
      }
      return
    }
    if (params?.force) {
      await queryClient.invalidateQueries({ queryKey: ['wallet-transactions', id] })
    } else {
      await queryClient.fetchQuery({ queryKey: ['wallet-transactions', id] })
    }
  }

  async function fetchBudgets(status?: BudgetStatus, opts?: { force?: boolean }) {
    const id = wsId.value
    if (!id) return
    if (status) {
      // Filtered queries are one-off fetches
      try {
        const qs = `?status=${status}`
        const data = await authFetch<SessionBudget[]>(`/workspaces/${id}/wallet/budgets${qs}`)
        queryClient.setQueryData(['wallet-budgets', id], data)
      } catch {
        // leave existing cache intact
      }
      return
    }
    if (opts?.force) {
      await queryClient.invalidateQueries({ queryKey: ['wallet-budgets', id] })
    } else {
      await queryClient.fetchQuery({ queryKey: ['wallet-budgets', id] })
    }
  }

  async function allocateBudget(sessionId: string, allocatedCents: number) {
    if (!wsId.value) return null
    try {
      const budget = await authFetch<SessionBudget>(`/workspaces/${wsId.value}/wallet/budgets`, {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, allocated_cents: allocatedCents }),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', wsId.value] }),
        queryClient.invalidateQueries({ queryKey: ['wallet-transactions', wsId.value] }),
        queryClient.invalidateQueries({ queryKey: ['wallet-budgets', wsId.value] }),
      ])
      return budget
    } catch {
      return null
    }
  }

  async function updateBudgetStatus(sessionId: string, status: BudgetStatus, workspaceId?: string) {
    try {
      const id = workspaceId ?? wsId.value
      const qs = id ? `?workspace_id=${id}` : ''
      const budget = await authFetch<SessionBudget>(`/sessions/${sessionId}/budget${qs}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', wsId.value] }),
        queryClient.invalidateQueries({ queryKey: ['wallet-transactions', wsId.value] }),
        queryClient.invalidateQueries({ queryKey: ['wallet-budgets', wsId.value] }),
      ])
      return budget
    } catch {
      return null
    }
  }

  async function getSessionBudget(sessionId: string) {
    try {
      return await authFetch<SessionBudget>(`/sessions/${sessionId}/budget`)
    } catch {
      return null
    }
  }

  async function topUp(amountCents: number) {
    if (!wsId.value) return null
    try {
      const result = await $fetch<{ url: string }>('/api/stripe/wallet-topup', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: wsId.value,
          amountCents,
        }),
      })
      if (result?.url) {
        window.location.href = result.url
      }
      return result
    }
    catch {
      return null
    }
  }

  const balanceDisplay = computed(() => {
    if (!wallet.value) return '$0.00'
    return formatCents(wallet.value.balance_cents)
  })

  // True only on the first-ever load (no cached wallet yet). Lets the UI show a
  // skeleton instead of a misleading "$0.00" before the balance arrives; once
  // cached it stays false, so revisits paint the real value immediately.
  const balanceLoading = computed(() => walletQuery.isLoading.value)

  function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`
  }

  return {
    wallet,
    transactions,
    budgets,
    loading,
    balanceDisplay,
    balanceLoading,
    fetchWallet,
    fetchTransactions,
    fetchBudgets,
    allocateBudget,
    updateBudgetStatus,
    getSessionBudget,
    topUp,
    formatCents,
  }
}
