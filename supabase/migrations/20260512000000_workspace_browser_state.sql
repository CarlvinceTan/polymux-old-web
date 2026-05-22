-- Workspace-shared browser login state.
--
-- Cookies and localStorage captured from one workspace member's managed
-- browser are stored encrypted at the workspace level and preloaded into
-- every subsequent managed browser launched for that workspace, on any
-- machine, by any member. The result: a workflow that ran a Gmail login
-- on Monday lets every workflow in the same workspace start the week
-- already signed in.
--
-- Two storage shapes:
--   * Cookies live in workspace_browser_cookies, one row per cookie. Two
--     concurrent workflows merging cookies for the same origin won't
--     clobber each other — the upsert in capture_workspace_browser_cookies
--     skips rows whose existing last_seen_at is newer.
--   * localStorage lives in workspace_browser_states, one vault-encrypted
--     JSON blob per origin. The capture RPC takes a row lock, decrypts,
--     merges by key with last-write-wins, and re-encrypts. Mirrors
--     workspace_passwords' use of vault.create_secret / update_secret.
--
-- Cookie values are encrypted with pgp_sym_encrypt using a per-workspace
-- random passphrase stored in vault.secrets. ensure_workspace_browser_key
-- creates the passphrase on first capture. RLS on the metadata mirrors
-- workspace_passwords: members read, owner+admin+member write.

create extension if not exists pgcrypto with schema extensions;

-- ── tables ────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_browser_keys (
  workspace_id     uuid        primary key references public.workspaces(id) on delete cascade,
  vault_secret_id  uuid        not null,
  created_at       timestamptz not null default now()
);

create table if not exists public.workspace_browser_cookies (
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  origin       text        not null,
  name         text        not null,
  domain       text        not null,
  path         text        not null,
  value_enc    bytea       not null,
  expires_at   timestamptz,
  http_only    boolean     not null default false,
  secure       boolean     not null default false,
  same_site    text        not null default 'Lax',
  last_seen_at timestamptz not null,
  observed_by  uuid        references auth.users(id) on delete set null,
  primary key (workspace_id, origin, name, domain, path)
);
create index if not exists idx_workspace_browser_cookies_origin
  on public.workspace_browser_cookies(workspace_id, origin);
create index if not exists idx_workspace_browser_cookies_expires
  on public.workspace_browser_cookies(expires_at)
  where expires_at is not null;

create table if not exists public.workspace_browser_states (
  id               uuid        primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  origin           text        not null,
  vault_secret_id  uuid        not null,
  fingerprint_seed text,
  last_seen_at     timestamptz not null,
  captured_by      uuid        references auth.users(id) on delete set null,
  last_used_by     uuid        references auth.users(id) on delete set null,
  last_used_at     timestamptz,
  use_count        integer     not null default 0,
  enabled          boolean     not null default true,
  unique (workspace_id, origin)
);
create index if not exists idx_workspace_browser_states_workspace
  on public.workspace_browser_states(workspace_id);

alter table public.workspace_browser_keys    enable row level security;
alter table public.workspace_browser_cookies enable row level security;
alter table public.workspace_browser_states  enable row level security;

-- ── RLS policies (members read, member+ write) ────────────────────────────────

-- workspace_browser_keys is implementation detail; members can read so
-- nothing breaks if a future UI needs to know "this workspace has a key".
-- Writes are gated to service-role only by omitting an insert/update policy.
create policy "workspace_members_select_browser_keys"
  on public.workspace_browser_keys for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_browser_keys.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_select_browser_cookies"
  on public.workspace_browser_cookies for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_browser_cookies.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace_members_select_browser_states"
  on public.workspace_browser_states for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_browser_states.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Member+ can delete (used by the future "Forget this site" admin UI and by
-- delete_workspace_browser_origin called via service-role).
create policy "workspace_members_delete_browser_cookies"
  on public.workspace_browser_cookies for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_browser_cookies.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin', 'member')
    )
  );

create policy "workspace_members_delete_browser_states"
  on public.workspace_browser_states for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_browser_states.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin', 'member')
    )
  );

-- No insert/update policies: writes only via service-role RPCs below.
-- Service-role bypasses RLS, so capture/load functions work without policies.

-- ── ensure_workspace_browser_key ──────────────────────────────────────────────
-- Idempotent: returns the existing key's vault_secret_id, or creates one on
-- first call. The passphrase is 256 random bits base64-encoded, used as the
-- pgp_sym_encrypt passphrase (pgcrypto runs its own KDF).
create or replace function public.ensure_workspace_browser_key(
  p_workspace_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_secret_id uuid;
  v_pass      text;
begin
  select vault_secret_id into v_secret_id
  from public.workspace_browser_keys
  where workspace_id = p_workspace_id;

  if found then
    return v_secret_id;
  end if;

  v_pass := encode(extensions.gen_random_bytes(32), 'base64');

  select vault.create_secret(
    v_pass,
    'workspace-browser-key:' || p_workspace_id::text,
    'workspace browser-state encryption key'
  ) into v_secret_id;

  insert into public.workspace_browser_keys (workspace_id, vault_secret_id)
  values (p_workspace_id, v_secret_id)
  on conflict (workspace_id) do nothing;

  -- Race: another transaction may have inserted between the SELECT and the
  -- INSERT. Re-read to pick up the winning row's secret id.
  select vault_secret_id into v_secret_id
  from public.workspace_browser_keys
  where workspace_id = p_workspace_id;

  return v_secret_id;
end;
$$;

-- Read-only helper: returns the decrypted passphrase for a workspace.
-- Internal to the other RPCs in this file.
create or replace function public.workspace_browser_key_passphrase(
  p_workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_pass      text;
begin
  v_secret_id := public.ensure_workspace_browser_key(p_workspace_id);
  select decrypted_secret into v_pass
  from vault.decrypted_secrets
  where id = v_secret_id;
  return v_pass;
end;
$$;

-- ── capture_workspace_browser_cookies ─────────────────────────────────────────
-- Bulk-upsert cookies for a single origin. p_cookies is a JSON array of:
--   {name, domain, path, value, expires_at, http_only, secure, same_site,
--    last_seen_at, observed_by}
-- Each row is upserted with the CRDT guard: keep the existing row if its
-- last_seen_at is newer or equal. Out-of-order concurrent writers therefore
-- converge to the most-recently-observed state per cookie key.
create or replace function public.capture_workspace_browser_cookies(
  p_workspace_id uuid,
  p_origin       text,
  p_cookies      jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_pass    text;
  v_count   integer := 0;
begin
  if p_cookies is null or jsonb_typeof(p_cookies) <> 'array' then
    return 0;
  end if;

  v_pass := public.workspace_browser_key_passphrase(p_workspace_id);

  with src as (
    select
      (c->>'name')                                       as name,
      (c->>'domain')                                     as domain,
      (c->>'path')                                       as path,
      (c->>'value')                                      as value,
      nullif(c->>'expires_at','')::timestamptz           as expires_at,
      coalesce((c->>'http_only')::boolean, false)        as http_only,
      coalesce((c->>'secure')::boolean, false)           as secure,
      coalesce(nullif(c->>'same_site',''), 'Lax')        as same_site,
      coalesce(nullif(c->>'last_seen_at','')::timestamptz, now()) as last_seen_at,
      nullif(c->>'observed_by','')::uuid                 as observed_by
    from jsonb_array_elements(p_cookies) as c
  ),
  upserted as (
    insert into public.workspace_browser_cookies
      (workspace_id, origin, name, domain, path, value_enc,
       expires_at, http_only, secure, same_site, last_seen_at, observed_by)
    select
      p_workspace_id,
      p_origin,
      name, domain, path,
      extensions.pgp_sym_encrypt(value, v_pass),
      expires_at, http_only, secure, same_site, last_seen_at, observed_by
    from src
    where name is not null and domain is not null and path is not null
    on conflict (workspace_id, origin, name, domain, path) do update
      set value_enc    = excluded.value_enc,
          expires_at   = excluded.expires_at,
          http_only    = excluded.http_only,
          secure       = excluded.secure,
          same_site    = excluded.same_site,
          last_seen_at = excluded.last_seen_at,
          observed_by  = excluded.observed_by
      where excluded.last_seen_at > public.workspace_browser_cookies.last_seen_at
    returning 1
  )
  select count(*) into v_count from upserted;

  return v_count;
end;
$$;

-- ── load_workspace_browser_cookies ────────────────────────────────────────────
-- Returns decrypted, non-expired cookies for every origin in the workspace.
-- The Go preloader calls this once per browser launch.
create or replace function public.load_workspace_browser_cookies(
  p_workspace_id uuid
)
returns table (
  origin       text,
  name         text,
  domain       text,
  path         text,
  value        text,
  expires_at   timestamptz,
  http_only    boolean,
  secure       boolean,
  same_site    text,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_pass text;
begin
  v_pass := public.workspace_browser_key_passphrase(p_workspace_id);

  return query
    select
      c.origin,
      c.name,
      c.domain,
      c.path,
      extensions.pgp_sym_decrypt(c.value_enc, v_pass)::text,
      c.expires_at,
      c.http_only,
      c.secure,
      c.same_site,
      c.last_seen_at
    from public.workspace_browser_cookies c
    where c.workspace_id = p_workspace_id
      and (c.expires_at is null or c.expires_at > now());
end;
$$;

-- ── capture_workspace_browser_state ───────────────────────────────────────────
-- Merge a localStorage delta for one origin. p_local_storage_delta is a JSON
-- object {key: {v: <string>, last_seen: <timestamptz>}}. We lock the row,
-- decrypt the existing blob (if any), apply last-write-wins per key,
-- re-encrypt via vault.update_secret. New rows get vault.create_secret +
-- insert.
create or replace function public.capture_workspace_browser_state(
  p_workspace_id          uuid,
  p_origin                text,
  p_local_storage_delta   jsonb,
  p_fingerprint_seed      text,
  p_observed_by           uuid
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id    uuid;
  v_existing     jsonb := '{}'::jsonb;
  v_merged       jsonb := '{}'::jsonb;
  v_key          text;
  v_delta_entry  jsonb;
  v_existing_entry jsonb;
begin
  if p_local_storage_delta is null or jsonb_typeof(p_local_storage_delta) <> 'object' then
    p_local_storage_delta := '{}'::jsonb;
  end if;

  -- Lock the row to serialize concurrent merges for this (workspace, origin).
  select vault_secret_id into v_secret_id
  from public.workspace_browser_states
  where workspace_id = p_workspace_id
    and origin = p_origin
  for update;

  if found then
    select coalesce(
             (select decrypted_secret::jsonb
              from vault.decrypted_secrets
              where id = v_secret_id),
             '{}'::jsonb)
      into v_existing;
  end if;

  -- Start from the existing map, then layer the delta with last-write-wins.
  v_merged := coalesce(v_existing, '{}'::jsonb);
  for v_key, v_delta_entry in
    select * from jsonb_each(p_local_storage_delta)
  loop
    v_existing_entry := v_merged -> v_key;
    if v_existing_entry is null
       or (v_delta_entry ->> 'last_seen')::timestamptz
          > coalesce((v_existing_entry ->> 'last_seen')::timestamptz, '-infinity'::timestamptz)
    then
      v_merged := jsonb_set(v_merged, array[v_key], v_delta_entry, true);
    end if;
  end loop;

  if v_secret_id is null then
    select vault.create_secret(
      v_merged::text,
      'workspace-browser-state:' || p_workspace_id::text || ':' || p_origin,
      'workspace browser localStorage'
    ) into v_secret_id;

    insert into public.workspace_browser_states
      (workspace_id, origin, vault_secret_id, fingerprint_seed,
       last_seen_at, captured_by)
    values
      (p_workspace_id, p_origin, v_secret_id, p_fingerprint_seed,
       now(), p_observed_by);
  else
    perform vault.update_secret(
      v_secret_id,
      v_merged::text,
      'workspace-browser-state:' || p_workspace_id::text || ':' || p_origin
    );
    update public.workspace_browser_states
       set last_seen_at     = now(),
           fingerprint_seed = coalesce(p_fingerprint_seed, fingerprint_seed)
     where workspace_id = p_workspace_id
       and origin = p_origin;
  end if;
end;
$$;

-- ── load_workspace_browser_state ──────────────────────────────────────────────
-- Returns decrypted localStorage maps for every enabled origin in the
-- workspace. The Go preloader calls this once per browser launch and uses
-- AddInitScript so each map lands at document_start on its origin.
create or replace function public.load_workspace_browser_state(
  p_workspace_id uuid
)
returns table (
  origin            text,
  local_storage     jsonb,
  fingerprint_seed  text,
  last_seen_at      timestamptz
)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
    select
      s.origin,
      coalesce(
        (select decrypted_secret::jsonb
         from vault.decrypted_secrets
         where id = s.vault_secret_id),
        '{}'::jsonb),
      s.fingerprint_seed,
      s.last_seen_at
    from public.workspace_browser_states s
    where s.workspace_id = p_workspace_id
      and s.enabled = true;
end;
$$;

-- Records that the supplied user just preloaded this saved sign-in into a
-- managed browser. Cheap, non-transactional update; the load path fires it
-- once per origin returned by load_workspace_browser_state.
create or replace function public.touch_workspace_browser_state_used(
  p_workspace_id uuid,
  p_origin       text,
  p_used_by      uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace_browser_states
     set use_count    = use_count + 1,
         last_used_at = now(),
         last_used_by = p_used_by
   where workspace_id = p_workspace_id
     and origin = p_origin;
end;
$$;

-- ── delete_workspace_browser_origin ───────────────────────────────────────────
-- Forget everything we know about one (workspace, origin) — cookies, state
-- blob, vault secret. Called by the future admin UI; allowed for service-role
-- and for any workspace member with write role.
create or replace function public.delete_workspace_browser_origin(
  p_workspace_id uuid,
  p_origin       text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
  ) then
    raise exception 'permission denied';
  end if;

  delete from public.workspace_browser_cookies
   where workspace_id = p_workspace_id and origin = p_origin;

  select vault_secret_id into v_secret_id
    from public.workspace_browser_states
   where workspace_id = p_workspace_id and origin = p_origin;

  delete from public.workspace_browser_states
   where workspace_id = p_workspace_id and origin = p_origin;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
-- Only authenticated and service_role can invoke. Anon stays locked out.
revoke all on function public.ensure_workspace_browser_key(uuid) from public;
revoke all on function public.workspace_browser_key_passphrase(uuid) from public;
revoke all on function public.capture_workspace_browser_cookies(uuid, text, jsonb) from public;
revoke all on function public.load_workspace_browser_cookies(uuid) from public;
revoke all on function public.capture_workspace_browser_state(uuid, text, jsonb, text, uuid) from public;
revoke all on function public.load_workspace_browser_state(uuid) from public;
revoke all on function public.touch_workspace_browser_state_used(uuid, text, uuid) from public;
revoke all on function public.delete_workspace_browser_origin(uuid, text) from public;

grant execute on function public.capture_workspace_browser_cookies(uuid, text, jsonb) to service_role;
grant execute on function public.load_workspace_browser_cookies(uuid)                  to service_role, authenticated;
grant execute on function public.capture_workspace_browser_state(uuid, text, jsonb, text, uuid) to service_role;
grant execute on function public.load_workspace_browser_state(uuid)                   to service_role, authenticated;
grant execute on function public.touch_workspace_browser_state_used(uuid, text, uuid) to service_role;
grant execute on function public.delete_workspace_browser_origin(uuid, text)          to service_role, authenticated;
