// Runtime kill switch for the wallet feature on Nuxt server routes.
//
// The polymux Go server consults the PostHog `wallet` flag directly (via
// FlagCache + model.WalletEnabled()); the Nuxt server reads a mirror env var.
// Set `WALLET_ENABLED=true` on the Nuxt host when toggling the PostHog flag
// on, so both sides agree. Default (unset) is disabled — opt-in.
export function walletEnabled(): boolean {
  const v = (process.env.WALLET_ENABLED ?? '').trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return true
  return false
}
