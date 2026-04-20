import { serverSupabaseServiceRole } from '#supabase/server'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  const body = await readBody<{
    workspaceId?: unknown
    amountCents?: unknown
    currency?: unknown
  }>(event)

  const workspaceId = body.workspaceId as string | undefined
  const amountCents = body.amountCents as number | undefined
  const currency = (typeof body.currency === 'string' ? body.currency : 'usd') as string

  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspace_id is required.' })
  }

  const validAmounts = [500, 1000, 2500, 5000, 10000]
  if (!amountCents || !validAmounts.includes(amountCents)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount. Must be 500, 1000, 2500, 5000, or 10000 cents.' })
  }

  const stripe = useStripe()
  const origin = getRequestURL(event).origin

  const admin = serverSupabaseServiceRole(event)

  const { data: wallet, error: walletError } = await admin
    .from('wallets')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single()

  if (walletError || !wallet) {
    throw createError({ statusCode: 404, statusMessage: 'Wallet not found.' })
  }

  const { data: memberCheck } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!memberCheck || !['owner', 'admin'].includes(memberCheck.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only workspace owners or admins can top up.' })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    line_items: [{
      price_data: {
        currency,
        product_data: {
          name: `Polymux Credits — ${formatCents(amountCents, currency as any)}`,
          description: `${formatCents(amountCents, currency as any)} credit top-up for your Polymux workspace.`,
        },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    metadata: {
      userId: user.id,
      workspaceId,
      walletId: wallet.id,
      amountCents: String(amountCents),
      type: 'wallet_top_up',
    },
    success_url: `${origin}/vault/wallet?top_up=success`,
    cancel_url: `${origin}/vault/wallet?top_up=cancelled`,
  })

  if (!session.url) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create checkout session.' })
  }

  return { url: session.url }
})

function formatCents(cents: number, currency: string): string {
  const zeroDecimal = ['jpy', 'krw'].includes(currency)
  if (zeroDecimal) return `${cents.toLocaleString()} ${currency.toUpperCase()}`
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
}