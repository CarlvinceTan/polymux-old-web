import type { SupportedCurrency } from './useCurrency'

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
  const wallet = useState<Wallet | null>('wallet', () => null)
  const transactions = useState<Transaction[]>('wallet-transactions', () => [])
  const budgets = useState<SessionBudget[]>('wallet-budgets', () => [])
  const loading = useState('wallet-loading', () => false)

  async function fetchWallet() {
    if (!currentWorkspaceId.value) return
    loading.value = true
    try {
      wallet.value = await authFetch<Wallet>(`/workspaces/${currentWorkspaceId.value}/wallet`)
    }
    catch {
      wallet.value = null
    }
    finally {
      loading.value = false
    }
  }

  async function fetchTransactions(params?: { type?: TransactionType; sessionId?: string }) {
    if (!currentWorkspaceId.value) return
    loading.value = true
    try {
      const query = new URLSearchParams()
      if (params?.type) query.set('type', params.type)
      if (params?.sessionId) query.set('session_id', params.sessionId)
      const qs = query.toString()
      const path = `/workspaces/${currentWorkspaceId.value}/wallet/transactions${qs ? `?${qs}` : ''}`
      transactions.value = await authFetch<Transaction[]>(path)
    }
    catch {
      transactions.value = []
    }
    finally {
      loading.value = false
    }
  }

  async function fetchBudgets(status?: BudgetStatus) {
    if (!currentWorkspaceId.value) return
    loading.value = true
    try {
      const qs = status ? `?status=${status}` : ''
      budgets.value = await authFetch<SessionBudget[]>(`/workspaces/${currentWorkspaceId.value}/wallet/budgets${qs}`)
    }
    catch {
      budgets.value = []
    }
    finally {
      loading.value = false
    }
  }

  async function allocateBudget(sessionId: string, allocatedCents: number) {
    if (!currentWorkspaceId.value) return null
    loading.value = true
    try {
      const budget = await authFetch<SessionBudget>(`/workspaces/${currentWorkspaceId.value}/wallet/budgets`, {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, allocated_cents: allocatedCents }),
      })
      await Promise.all([fetchWallet(), fetchTransactions(), fetchBudgets()])
      return budget
    }
    catch {
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function updateBudgetStatus(sessionId: string, status: BudgetStatus, workspaceId?: string) {
    loading.value = true
    try {
      const wsId = workspaceId ?? currentWorkspaceId.value
      const qs = wsId ? `?workspace_id=${wsId}` : ''
      const budget = await authFetch<SessionBudget>(`/sessions/${sessionId}/budget${qs}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await Promise.all([fetchWallet(), fetchTransactions(), fetchBudgets()])
      return budget
    }
    catch {
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function getSessionBudget(sessionId: string) {
    loading.value = true
    try {
      return await authFetch<SessionBudget>(`/sessions/${sessionId}/budget`)
    }
    catch {
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function topUp(amountCents: number, currency: SupportedCurrency = 'usd') {
    if (!currentWorkspaceId.value) return null
    try {
      const result = await $fetch<{ url: string }>('/api/stripe/wallet-topup', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: currentWorkspaceId.value,
          amountCents,
          currency,
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
    return formatCents(wallet.value.balance_cents, wallet.value.currency as SupportedCurrency)
  })

  function formatCents(cents: number, currency: SupportedCurrency = 'usd'): string {
    const zeroDecimal = ['jpy', 'krw'].includes(currency)
    if (zeroDecimal) return `${currency.toUpperCase()} ${cents.toLocaleString()}`
    return `$${(cents / 100).toFixed(2)}`
  }

  return {
    wallet,
    transactions,
    budgets,
    loading,
    balanceDisplay,
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