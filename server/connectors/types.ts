// Shared interface for first-party OAuth connector handlers.
//
// Until Phase 0, the connect/callback routes used hard-coded switch statements
// per provider. This interface is the registry seam: each provider implements
// `ConnectorHandler` and `getConnector(id)` dispatches by id. Routes never
// import provider-specific helpers directly.
//
// Why "connector" rather than "integration": externally and in DB the umbrella
// term is *integration* (and the `integrations` table is the catalog). Inside
// the code, *connector* names the OAuth-handler subset specifically — the
// stuff that runs the redirect/callback dance. Third-party `kind='integration'`
// runtime dispatch lives elsewhere (Phase 2).
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ConnectorTokens {
  access_token: string
  refresh_token?: string | null
  expires_in?: number | null
  scope?: string | null
  /**
   * Provider-specific token response carried through to `fetchIdentity`/
   * `buildIntegrationRow`. Typed `unknown` so providers can pass their
   * concrete response shape and consumers cast it back at the use site.
   */
  raw: unknown
}

export interface ConnectorIdentity {
  email: string | null
  displayName: string | null
  /** Stable identifier the provider gives for this user (sub, login, viewer.id). */
  providerSubject?: string | null
  /** Provider-specific identity payload carried into buildIntegrationRow for metadata. */
  raw?: unknown
}

/** Shape persisted into the `workspace_integrations` row. */
export interface IntegrationRow {
  workspace_id: string
  provider: string
  connected_by: string
  account_email: string | null
  account_display_name: string | null
  scopes: string[]
  access_token_enc: string
  refresh_token_enc: string | null
  expires_at: string | null
  root_folder_id: string | null
  root_folder_name: string | null
  metadata: Record<string, unknown>
}

export interface BuildRowPayload {
  workspace_id: string
  user_id: string
  tokens: ConnectorTokens
  identity: ConnectorIdentity
  /** Did the user opt into a Drive→workspace migration? Only Drive consults this. */
  migrate?: boolean
}

/** Service-role Supabase client. Drive uses it during install to look up workspace name. */
type AdminClient = SupabaseClient

export interface ConnectorHandler {
  /** Stable id matching `integrations.slug` for the first-party row. */
  id: string

  /** Default OAuth scopes plus a human-readable rationale shown in the install UI. */
  scopes: { default: string[], rationale: string }

  /**
   * Build the provider's OAuth consent URL. State is the JWT we issued in
   * `connect.get.ts`; the provider redirects back to it on completion.
   */
  buildAuthUrl: (state: string, opts?: { scopes?: string[] }) => string

  /** Exchange the `code` from the callback for tokens. */
  exchangeCode: (code: string) => Promise<ConnectorTokens>

  /** Fetch the connecting user's identity using the tokens. May return nulls. */
  fetchIdentity: (tokens: ConnectorTokens) => Promise<ConnectorIdentity>

  /**
   * Construct the row to upsert into `workspace_integrations`. Default
   * implementation in `buildDefaultIntegrationRow` covers the common shape;
   * connectors override only when they need to do extra work at install
   * time (Drive creates a per-workspace root folder; Slack/Notion encode
   * provider-specific metadata).
   */
  buildIntegrationRow: (payload: BuildRowPayload, admin: AdminClient) => Promise<IntegrationRow>

  /**
   * Optional refresh path. Only Drive/Gmail (Google) currently issue refresh
   * tokens; GitHub/Slack/Notion/Linear tokens are long-lived. driveTokens.ts
   * still calls Google's refresh helper directly today and stays unchanged
   * — this hook is for future use by a generic refresh dispatcher.
   */
  refreshAccessToken?: (refreshToken: string) => Promise<ConnectorTokens>
}
