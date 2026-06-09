-- Authenticator (TOTP) secret for a saved credential.
--
-- The setup key (an otpauth:// URI or a base32 secret) is stored via Supabase
-- Vault exactly like the password, referenced by `totp_secret_id`. Null means
-- the credential has no authenticator configured. The client decodes the key
-- and computes rotating codes locally (see app/composables/vault/totp.ts).
alter table public.workspace_passwords
  add column if not exists totp_secret_id uuid;

-- ── create (now accepts an optional TOTP setup key) ───────────────────────────
-- Adding a parameter changes the signature, so drop the old overload first
-- (mirrors 20260523000001_drop_old_upsert_user_settings_overloads.sql).
drop function if exists public.create_workspace_password(uuid, text, text, text, text, boolean);
create or replace function public.create_workspace_password(
  p_workspace_id  uuid,
  p_name          text,
  p_url           text,
  p_username      text,
  p_password      text,
  p_is_weak       boolean default false,
  p_totp_secret   text    default null
)
returns public.workspace_passwords
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id      uuid;
  v_totp_secret_id uuid;
  v_result         public.workspace_passwords;
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

  if p_totp_secret is not null and length(trim(p_totp_secret)) > 0 then
    select vault.create_secret(
      p_totp_secret,
      p_name || ':totp:' || p_workspace_id::text,
      'workspace password totp'
    ) into v_totp_secret_id;
  end if;

  insert into public.workspace_passwords (
    workspace_id, created_by, name, url, username, vault_secret_id, is_weak, totp_secret_id
  ) values (
    p_workspace_id, auth.uid(), p_name, p_url, p_username, v_secret_id, p_is_weak, v_totp_secret_id
  )
  returning * into v_result;

  return v_result;
end;
$$;

-- ── reveal TOTP setup key ─────────────────────────────────────────────────────
create or replace function public.get_workspace_password_totp_secret(
  p_password_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_id   uuid;
  v_totp_secret_id uuid;
  v_decrypted      text;
begin
  select wp.workspace_id, wp.totp_secret_id
  into   v_workspace_id, v_totp_secret_id
  from   public.workspace_passwords wp
  where  wp.id = p_password_id;

  if not found then
    raise exception 'not found';
  end if;

  if v_totp_secret_id is null then
    return null;
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = auth.uid()
  ) then
    raise exception 'permission denied';
  end if;

  select decrypted_secret
  into   v_decrypted
  from   vault.decrypted_secrets
  where  id = v_totp_secret_id;

  return v_decrypted;
end;
$$;

-- ── update (set / replace / clear the TOTP secret) ────────────────────────────
drop function if exists public.update_workspace_password(uuid, text, text, text, text, boolean);
create or replace function public.update_workspace_password(
  p_password_id uuid,
  p_name        text,
  p_url         text,
  p_username    text,
  p_password    text    default null,
  p_is_weak     boolean default null,
  p_totp_secret text    default null,
  p_clear_totp  boolean default false
)
returns public.workspace_passwords
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_id   uuid;
  v_secret_id      uuid;
  v_totp_secret_id uuid;
  v_result         public.workspace_passwords;
begin
  select wp.workspace_id, wp.vault_secret_id, wp.totp_secret_id
  into   v_workspace_id, v_secret_id, v_totp_secret_id
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

  -- TOTP: an explicit clear wins; otherwise set/replace when a key is supplied.
  if p_clear_totp then
    if v_totp_secret_id is not null then
      delete from vault.secrets where id = v_totp_secret_id;
      v_totp_secret_id := null;
    end if;
  elsif p_totp_secret is not null and length(trim(p_totp_secret)) > 0 then
    if v_totp_secret_id is null then
      select vault.create_secret(
        p_totp_secret,
        p_name || ':totp:' || v_workspace_id::text,
        'workspace password totp'
      ) into v_totp_secret_id;
    else
      perform vault.update_secret(
        v_totp_secret_id,
        p_totp_secret,
        p_name || ':totp:' || v_workspace_id::text
      );
    end if;
  end if;

  update public.workspace_passwords
  set    name           = p_name,
         url            = p_url,
         username       = p_username,
         is_weak        = coalesce(p_is_weak, is_weak),
         totp_secret_id = v_totp_secret_id,
         updated_at     = now()
  where  id = p_password_id
  returning * into v_result;

  return v_result;
end;
$$;

-- ── delete (also drops the TOTP secret) ───────────────────────────────────────
create or replace function public.delete_workspace_password(
  p_password_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_workspace_id   uuid;
  v_secret_id      uuid;
  v_totp_secret_id uuid;
begin
  select wp.workspace_id, wp.vault_secret_id, wp.totp_secret_id
  into   v_workspace_id, v_secret_id, v_totp_secret_id
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
  if v_totp_secret_id is not null then
    delete from vault.secrets where id = v_totp_secret_id;
  end if;
end;
$$;
