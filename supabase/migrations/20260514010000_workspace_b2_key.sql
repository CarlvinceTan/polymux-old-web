-- Per-workspace Backblaze B2 application keys.
--
-- Each workspace gets a dedicated B2 application key minted by polymux's
-- master key. The sub-key is scoped via B2's namePrefix to ONLY the
-- workspace's `{workspace_id}/` object prefix, so a leak only exposes that
-- workspace's bytes. Master key never leaves the polymux backend.
--
-- Storage shape: provider='b2' row in workspace_integrations. The
-- applicationKey (secret) goes in `access_token_enc` (encrypted via the
-- existing AES-256-GCM helper). The applicationKeyId (non-secret) goes in
-- the new `key_external_id` column so callers can present it in audit
-- logs / debug surfaces without decrypting. There is no refresh_token for
-- B2 keys — they don't expire by default and rotation is initiated by
-- polymux explicitly.
--
-- `connected_by` is set to the workspace's owner at mint time; it satisfies
-- the existing NOT NULL constraint without inviting a user-driven OAuth
-- flow. The "connection" is auto-provisioned, not user-action-initiated.

alter table public.workspace_integrations
  add column if not exists key_external_id text;

comment on column public.workspace_integrations.key_external_id is
  'Non-secret public identifier for the credential — e.g. B2 applicationKeyId. NULL for OAuth-style integrations (Drive) where access_token_enc alone is the credential.';
