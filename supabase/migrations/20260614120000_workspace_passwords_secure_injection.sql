-- Secure credential handling for SOC 2.
--
-- Two changes, both about keeping vault secrets server-side only:
--
--  1. Passwords become write-only from any client. The user-scoped reveal RPC
--     (get_workspace_password_secret) is DROPPED, and a new service-role-only
--     RPC (vault_password_secret_for_service) is the *only* way to decrypt a
--     stored password. The Go backend calls it with the service-role key to
--     inject the secret into a browser fill below the model; the browser/web
--     client can no longer obtain a plaintext password at all.
--
--  2. Stored TOTP (2FA) seeds are removed entirely. Holding a site's second
--     factor next to its password collapses two factors into one and is a
--     liability we decline to carry — the agent now asks the user for a live
--     code at the 2FA wall instead. This drops the totp reveal RPC, the totp
--     column, and the totp parameters on create/update, and deletes any
--     existing encrypted TOTP seeds from the vault.
--
-- DESTRUCTIVE: drops functions, a column, and existing TOTP secrets. Apply to
-- dev first; there is no automatic down-migration.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1a. Service-role-only decryption for agent injection.
-- ──────────────────────────────────────────────────────────────────────────────
-- auth.uid() is null under the service-role key, so this authorises by matching
-- the row's workspace against p_workspace_id — the workspace the trusted Go
-- session is already bound to (set from the verified DB session row at connect).
create or replace function public.vault_password_secret_for_service(
  p_password_id  uuid,
  p_workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_id uuid;
  v_secret_id    uuid;
  v_decrypted    text;
begin
  select wp.workspace_id, wp.vault_secret_id
  into   v_workspace_id, v_secret_id
  from   public.workspace_passwords wp
  where  wp.id = p_password_id;

  if not found then
    raise exception 'not found';
  end if;

  -- Authorisation: the caller (the server) must name the owning workspace.
  if v_workspace_id is distinct from p_workspace_id then
    raise exception 'workspace mismatch';
  end if;

  update public.workspace_passwords
  set    usage_count  = usage_count + 1,
         last_used_at = now(),
         updated_at   = now()
  where  id = p_password_id;

  select decrypted_secret
  into   v_decrypted
  from   vault.decrypted_secrets
  where  id = v_secret_id;

  return v_decrypted;
end;
$$;

-- Lock it to the service role only. No client (anon/authenticated) may call it.
revoke all on function public.vault_password_secret_for_service(uuid, uuid) from public;
revoke all on function public.vault_password_secret_for_service(uuid, uuid) from anon, authenticated;
grant execute on function public.vault_password_secret_for_service(uuid, uuid) to service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1b. Remove the client-callable password reveal RPC entirely.
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_workspace_password_secret(uuid);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2a. Remove the TOTP reveal RPC.
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_workspace_password_totp_secret(uuid);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2b. create/update lose their TOTP parameters (drop the totp overloads,
--     recreate the pre-totp signatures).
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists public.create_workspace_password(uuid, text, text, text, text, boolean, text);
create or replace function public.create_workspace_password(
  p_workspace_id  uuid,
  p_name          text,
  p_url           text,
  p_username      text,
  p_password      text,
  p_is_weak       boolean default false
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
    workspace_id, created_by, name, url, username, vault_secret_id, is_weak
  ) values (
    p_workspace_id, auth.uid(), p_name, p_url, p_username, v_secret_id, p_is_weak
  )
  returning * into v_result;

  return v_result;
end;
$$;

drop function if exists public.update_workspace_password(uuid, text, text, text, text, boolean, text, boolean);
create or replace function public.update_workspace_password(
  p_password_id uuid,
  p_name        text,
  p_url         text,
  p_username    text,
  p_password    text    default null,
  p_is_weak     boolean default null
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
  set    name       = p_name,
         url        = p_url,
         username   = p_username,
         is_weak    = coalesce(p_is_weak, is_weak),
         updated_at = now()
  where  id = p_password_id
  returning * into v_result;

  return v_result;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2c. delete loses its TOTP cleanup (no more totp_secret_id).
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_workspace_password(
  p_password_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_id uuid;
  v_secret_id    uuid;
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

  delete from public.workspace_passwords where id = p_password_id;
  delete from vault.secrets where id = v_secret_id;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2d. Purge existing encrypted TOTP seeds, then drop the column.
-- Guarded so a re-run after the column is already gone is a clean no-op.
-- ──────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'workspace_passwords'
      and column_name  = 'totp_secret_id'
  ) then
    delete from vault.secrets
    where id in (
      select totp_secret_id
      from   public.workspace_passwords
      where  totp_secret_id is not null
    );
    alter table public.workspace_passwords drop column totp_secret_id;
  end if;
end $$;
