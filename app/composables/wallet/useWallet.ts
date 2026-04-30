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

// Stale-while-revalidate windows. Pages call fetchWallet/fetchTransactions/
// fetchBudgets in onMounted so revisits would otherwise refetch on every
// navigation. Suppressing within this window keeps the dashboard snappy on
// repeat opens; mutations (top-up, budget changes) call with `force: true`
// to bypass the cache.
const WALLET_STALE_MS = 30_000
const TRANSACTIONS_STALE_MS = 30_000
const BUDGETS_STALE_MS = 30_000

export function useWallet() {
  const { authFetch } = useAuthFetch()
  const { currentWorkspaceId } = useWorkspaces()
  const wallet = useState<Wallet | null>('wallet', () => null)
  const transactions = useState<Transaction[]>('wallet-transactions', () => [])
  const budgets = useState<SessionBudget[]>('wallet-budgets', () => [])
  const loading = useState('wallet-loading', () => false)

  // Per-resource fetch timestamps keyed by workspace id. Workspace switches
  // invalidate by virtue of the key changing, so the next caller fetches.
  const walletFetchedAt = useState<Record<string, number>>('wallet-fetched-at', () => ({}))
  const transactionsFetchedAt = useState<Record<string, number>>('wallet-transactions-fetched-at', () => ({}))
  const budgetsFetchedAt = useState<Record<string, number>>('wallet-budgets-fetched-at', () => ({}))

  async function fetchWallet(opts?: { force?: boolean }) {
    const wsId = currentWorkspaceId.value
    if (!wsId) return
    if (!opts?.force) {
      const last = walletFetchedAt.value[wsId] ?? 0
      if (Date.now() - last < WALLET_STALE_MS) return
    }
    loading.value = true
    try {
      wallet.value = await authFetch<Wallet>(`/workspaces/${wsId}/wallet`)
      walletFetchedAt.value = { ...walletFetchedAt.value, [wsId]: Date.now() }
    }
    catch {
      wallet.value = null
    }
    finally {
      loading.value = false
    }
  }

  async function fetchTransactions(params?: { type?: TransactionType; sessionId?: string; force?: boolean }) {
    const wsId = currentWorkspaceId.value
    if (!wsId) return
    // Filtered queries always hit the network — caching them per filter combo
    // would need a richer key, and they're only used by the wallet/usage pages
    // where freshness matters more than skip-on-revisit.
    const isFiltered = !!(params?.type || params?.sessionId)
    if (!isFiltered && !params?.force) {
      const last = transactionsFetchedAt.value[wsId] ?? 0
      if (Date.now() - last < TRANSACTIONS_STALE_MS) return
    }
    loading.value = true
    try {
      const query = new URLSearchParams()
      if (params?.type) query.set('type', params.type)
      if (params?.sessionId) query.set('session_id', params.sessionId)
      const qs = query.toString()
      const path = `/workspaces/${wsId}/wallet/transactions${qs ? `?${qs}` : ''}`
      transactions.value = await authFetch<Transaction[]>(path)
      if (!isFiltered) {
        transactionsFetchedAt.value = { ...transactionsFetchedAt.value, [wsId]: Date.now() }
      }
    }
    catch {
      transactions.value = []
    }
    finally {
      loading.value = false
    }
  }

  async function fetchBudgets(status?: BudgetStatus, opts?: { force?: boolean }) {
    const wsId = currentWorkspaceId.value
    if (!wsId) return
    if (!status && !opts?.force) {
      const last = budgetsFetchedAt.value[wsId] ?? 0
      if (Date.now() - last < BUDGETS_STALE_MS) return
    }
    loading.value = true
    try {
      const qs = status ? `?status=${status}` : ''
      budgets.value = await authFetch<SessionBudget[]>(`/workspaces/${wsId}/wallet/budgets${qs}`)
      if (!status) {
        budgetsFetchedAt.value = { ...budgetsFetchedAt.value, [wsId]: Date.now() }
      }
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
      await Promise.all([
        fetchWallet({ force: true }),
        fetchTransactions({ force: true }),
        fetchBudgets(undefined, { force: true }),
      ])
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
      await Promise.all([
        fetchWallet({ force: true }),
        fetchTransactions({ force: true }),
        fetchBudgets(undefined, { force: true }),
      ])
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