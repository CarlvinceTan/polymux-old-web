-- Vault: credentials as first-class TYPES (login | secret) + a per-credential
-- agent-access POLICY (allowed | consent_required | blocked).
--
-- Additive and security-preserving:
--  * adds two enum types (guarded so a re-run is a no-op),
--  * adds workspace_passwords.type + .agent_access (safe defaults),
--  * re-creates create/update_workspace_password with the SAME secure bodies
--    (vault.create_secret / vault.update_secret, membership checks, search_path)
--    plus the two new parameters — the secure-injection contract is unchanged,
--  * adds a read RPC (get_workspace_credentials) and an owner/admin policy RPC
--    (update_credential_agent_access).
--
-- The service-role decrypt RPC (vault_password_secret_for_service) and
-- delete_workspace_password are intentionally left untouched. Apply to dev first.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Enum types (guarded — CREATE TYPE has no IF NOT EXISTS).
-- ──────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'credential_type') then
    create type public.credential_type as enum ('login', 'secret');
  end if;
  if not exists (select 1 from pg_type where typname = 'agent_access_policy') then
    create type public.agent_access_policy as enum ('allowed', 'consent_required', 'blocked');
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Columns. Existing rows default to a login that requires consent (safe).
-- ──────────────────────────────────────────────────────────────────────────────
alter table public.workspace_passwords
  add column if not exists type         public.credential_type    not null default 'login',
  add column if not exists agent_access public.agent_access_policy not null default 'consent_required';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. create_workspace_password — current secure body + type/agent_access.
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists public.create_workspace_password(uuid, text, text, text, text, boolean);
create or replace function public.create_workspace_password(
  p_workspace_id  uuid,
  p_name          text,
  p_url           text,
  p_username      text,
  p_password      text,
  p_is_weak       boolean default false,
  p_type          public.credential_type default 'login',
  p_agent_access  public.agent_access_policy default 'consent_required'
)
returns public.workspace_passwords
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_result    public.workspace_passwords;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
  ) then
    raise exception 'permission denied';
  end if;

  select vault.create_secret(
    p_password,
    p_name || ':' || p_workspace_id::text,
    'workspace password'
  ) into v_secret_id;

  insert into public.workspace_passwords (
    workspace_id, created_by, name, url, username, vault_secret_id, is_weak, type, agent_access
  ) values (
    p_workspace_id, auth.uid(), p_name, p_url, p_username, v_secret_id, p_is_weak, p_type, p_agent_access
  )
  returning * into v_result;

  return v_result;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. update_workspace_password — current secure body + type/agent_access.
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists public.update_workspace_password(uuid, text, text, text, text, boolean);
create or replace function public.update_workspace_password(
  p_password_id uuid,
  p_name        text,
  p_url         text,
  p_username    text,
  p_password    text    default null,
  p_is_weak     boolean default null,
  p_type        public.credential_type default null,
  p_agent_access public.agent_access_policy default null
)
returns public.workspace_passwords
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_id uuid;
  v_secret_id    uuid;
  v_result       public.workspace_passwords;
begin
  select wp.workspace_id, wp.vault_secret_id
  into   v_workspace_id, v_secret_id
  from   public.workspace_passwords wp
  where  wp.id = p_password_id;

  if not found then
    raise exception 'not found';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'member')
  ) then
    raise exception 'permission denied';
  end if;

  if p_password is not null then
    perform vault.update_secret(
      v_secret_id,
      p_password,
      p_name || ':' || v_workspace_id::text
    );
  end if;

  update public.workspace_passwords
  set    name         = p_name,
         url          = p_url,
         username     = p_username,
         is_weak      = coalesce(p_is_weak, is_weak),
         type         = coalesce(p_type, type),
         agent_access = coalesce(p_agent_access, agent_access),
         updated_at   = now()
  where  id = p_password_id
  returning * into v_result;

  return v_result;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. get_workspace_credentials — metadata-only list (NEVER returns secrets),
--    filterable by type / agent_access / search. Any workspace member may read.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.get_workspace_credentials(
  p_workspace_id uuid,
  p_type         public.credential_type default null,
  p_agent_access public.agent_access_policy default null,
  p_search_term  text default null
)
returns table (
  id           uuid,
  name         text,
  url          text,
  username     text,
  type         public.credential_type,
  agent_access public.agent_access_policy,
  is_weak      boolean,
  usage_count  integer,
  last_used_at timestamptz,
  last_used_by uuid,
  created_by   uuid,
  created_at   timestamptz,
  updated_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
  ) then
    raise exception 'permission denied';
  end if;

  return query
    select
      wp.id, wp.name, wp.url, wp.username, wp.type, wp.agent_access,
      wp.is_weak, wp.usage_count, wp.last_used_at, wp.last_used_by,
      wp.created_by, wp.created_at, wp.updated_at
    from public.workspace_passwords wp
    where wp.workspace_id = p_workspace_id
      and (p_type is null or wp.type = p_type)
      and (p_agent_access is null or wp.agent_access = p_agent_access)
      and (
        p_search_term is null
        or wp.name     ilike '%' || p_search_term || '%'
        or wp.url      ilike '%' || p_search_term || '%'
        or wp.username ilike '%' || p_search_term || '%'
      )
    order by wp.created_at desc;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. update_credential_agent_access — owner/admin only governance control.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.update_credential_agent_access(
  p_credential_id uuid,
  p_agent_access  public.agent_access_policy
)
returns public.workspace_passwords
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_result       public.workspace_passwords;
begin
  select wp.workspace_id into v_workspace_id
  from   public.workspace_passwords wp
  where  wp.id = p_credential_id;

  if not found then
    raise exception 'not found';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) then
    raise exception 'permission denied';
  end if;

  update public.workspace_passwords
  set    agent_access = p_agent_access,
         updated_at   = now()
  where  id = p_credential_id
  returning * into v_result;

  return v_result;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Grants — read + policy RPCs are client-callable by authenticated members.
-- ──────────────────────────────────────────────────────────────────────────────
revoke all on function public.get_workspace_credentials(uuid, public.credential_type, public.agent_access_policy, text) from public;
grant execute on function public.get_workspace_credentials(uuid, public.credential_type, public.agent_access_policy, text) to authenticated;

revoke all on function public.update_credential_agent_access(uuid, public.agent_access_policy) from public;
grant execute on function public.update_credential_agent_access(uuid, public.agent_access_policy) to authenticated;
