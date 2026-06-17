// Plugin credential resolution — the generalisation of the BYOK pattern
// (workspace_llm_keys) to arbitrary plugin credentials declared in a manifest's
// `credentials[]` block.
//
// Resolution order (highest priority first):
//   1. workspace_integration_credentials  — the workspace's own (BYO) override
//   2. integration_credentials             — Polymux-team-provisioned (managed) default
//   3. null                                — unsatisfied; the install/connect must prompt
//
// Secret fields are stored per-field as AES-256-GCM ciphertext (tokenCrypto.ts)
// inside a jsonb map, so a single credential can carry {client_id, client_secret}.
// The plaintext only ever materialises server-side (web OAuth broker) or behind
// the internal, polymux-secret-gated endpoint (Go runtime) — never to a client
// or to third-party plugin code.

import { decryptToken, encryptToken } from '~~/server/utils/security/tokenCrypto'

export type CredentialSource = 'workspace' | 'managed'

export interface ResolvedCredential {
  key: string
  type: string
  source: CredentialSource
  fields: Record<string, string>
  scopes: string[]
}

/** Encrypt each field value; returns a jsonb-ready map of field → ciphertext. */
export function encryptFields(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && v.length > 0) out[k] = encryptToken(v)
  }
  return out
}

/** Decrypt a stored field → ciphertext map back to plaintext. */
export function decryptFields(enc: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(enc ?? {})) {
    if (typeof v === 'string') out[k] = decryptToken(v)
  }
  return out
}

/** Non-secret hint shown in the UI: which fields are set + last 4 of each. */
export function buildHint(fields: Record<string, string>): Record<string, string> {
  const hint: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && v.length > 0) hint[k] = v.length > 4 ? `…${v.slice(-4)}` : '••••'
  }
  return hint
}

// The new tables aren't in the generated Supabase types yet (run
// `supabase gen types`), so we treat the service-role client loosely and cast
// results at the use site — as dispatchIntegrationTool.ts does for the
// integration_versions table.
type LooseDb = { from: (table: string) => any }

export async function resolvePluginCredential(
  admin: unknown,
  args: { workspaceId: string, integrationId: string, credentialKey: string },
): Promise<ResolvedCredential | null> {
  const sb = admin as unknown as LooseDb

  // 1. Workspace override wins.
  const ws = await sb
    .from('workspace_integration_credentials')
    .select('credential_type, fields_enc')
    .eq('workspace_id', args.workspaceId)
    .eq('integration_id', args.integrationId)
    .eq('credential_key', args.credentialKey)
    .maybeSingle()
  const wsRow = ws.data as { credential_type?: string, fields_enc?: Record<string, unknown> } | null
  if (wsRow) {
    return {
      key: args.credentialKey,
      type: wsRow.credential_type ?? 'custom',
      source: 'workspace',
      fields: decryptFields(wsRow.fields_enc),
      scopes: [],
    }
  }

  // 2. Polymux-managed default.
  const mg = await sb
    .from('integration_credentials')
    .select('credential_type, fields_enc, scopes')
    .eq('integration_id', args.integrationId)
    .eq('credential_key', args.credentialKey)
    .maybeSingle()
  const mgRow = mg.data as { credential_type?: string, fields_enc?: Record<string, unknown>, scopes?: unknown } | null
  if (mgRow) {
    return {
      key: args.credentialKey,
      type: mgRow.credential_type ?? 'custom',
      source: 'managed',
      fields: decryptFields(mgRow.fields_enc),
      scopes: Array.isArray(mgRow.scopes) ? (mgRow.scopes as string[]) : [],
    }
  }

  return null
}
