// Admin environment switcher — lets a maintainer view/manage either the dev or
// prod data set from the in-web admin area, selected by a cookie set from a UI
// dropdown.
//
// 'dev' is always web's own configured project (the local/default one). 'prod'
// is only available when its service credentials are explicitly set, so a
// misconfigured deploy can't accidentally expose prod, and locally (where only
// dev is configured) prod simply isn't selectable. The prod service key stays
// server-side only — it is never sent to the browser.

import { serverSupabaseServiceRole } from '#supabase/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

export type AdminEnv = 'dev' | 'prod'
export const ADMIN_ENV_COOKIE = 'polymux_admin_env'

// Per-environment service credentials: DEV_SUPABASE_URL / DEV_SUPABASE_SECRET_KEY
// and PROD_SUPABASE_URL / PROD_SUPABASE_SECRET_KEY. Both secret keys stay
// server-side only — never sent to the browser. If DEV_* is unset we fall back
// to web's own default service client; if PROD_* is unset, prod isn't selectable.
function envCreds(env: AdminEnv): { url: string, key: string } | null {
  const prefix = env === 'prod' ? 'PROD' : 'DEV'
  const url = process.env[`${prefix}_SUPABASE_URL`]
  const key = process.env[`${prefix}_SUPABASE_SECRET_KEY`]
  return url && key ? { url, key } : null
}

export function adminEnvAvailable(env: AdminEnv): boolean {
  return env === 'dev' ? true : envCreds('prod') !== null
}

export function availableAdminEnvs(): AdminEnv[] {
  return adminEnvAvailable('prod') ? ['dev', 'prod'] : ['dev']
}

export function selectedAdminEnv(event: H3Event): AdminEnv {
  return getCookie(event, ADMIN_ENV_COOKIE) === 'prod' && adminEnvAvailable('prod') ? 'prod' : 'dev'
}

const clients: Partial<Record<AdminEnv, SupabaseClient>> = {}

/** Service-role client for the admin-selected environment. */
export function adminServiceClient(event: H3Event): { env: AdminEnv, client: SupabaseClient } {
  const env = selectedAdminEnv(event)
  const creds = envCreds(env)
  if (creds) {
    if (!clients[env]) {
      clients[env] = createClient(creds.url, creds.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    }
    return { env, client: clients[env]! }
  }
  // dev fallback: web's own configured service client.
  return { env: 'dev', client: serverSupabaseServiceRole(event) as unknown as SupabaseClient }
}
