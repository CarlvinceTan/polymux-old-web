// Runtime kill switch for plan-tier enforcement on Nuxt server routes.
//
// The polymux Go server consults the PostHog `plan_limits` flag directly
// (via FlagCache); the Nuxt server has no PostHog admin key, so it reads a
// mirror env var instead. Set `PLAN_LIMITS_ENFORCE=false` on the Nuxt host
// when toggling the PostHog flag off, so both sides bypass plan caps in
// lock-step. Default (unset) is enforced — fail-safe.
//
// Call sites: file/cloud uploads, artifact saves, BYOK key save. Each
// returns early ("no cap") when this returns false.
export function planLimitsEnforce(): boolean {
  const v = (process.env.PLAN_LIMITS_ENFORCE ?? '').trim().toLowerCase()
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false
  return true
}
