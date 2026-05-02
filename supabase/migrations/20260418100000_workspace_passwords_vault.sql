-- Workspace passwords metadata table (vault-backed encryption)
create table if not exists public.workspace_passwords (
  id             uuid        primary key default gen_random_uuid(),
  workspace_id   uuid        not null references public.workspaces(id) on delete cascade,
  created_by     uuid        not null references auth.users(id),
  name           text        not null,
  url            text        not null default '',
  username       text        not null default '',
  vault_secret_id uuid       not null,
  is_weak        boolean     not null default false,
  usage_count    integer     not null default 0,
  last_used_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.workspace_passwords enable row level security;
-- Workspace members can read password metadata
create policy "workspace_members_select_passwords"
  on public.workspace_passwords for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_passwords.workspace_id
        and wm.user_id = auth.uid()
    )
  );
-- ── create ────────────────────────────────────────────────────────────────────
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
-- ── reveal ────────────────────────────────────────────────────────────────────
create or replace function public.get_workspace_password_secret(
  p_password_id uuid
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

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = auth.uid()
  ) then
    raise exception 'permission denied';
  end if;

  -- record usage
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
-- ── update ────────────────────────────────────────────────────────────────────
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
-- ── delete ────────────────────────────────────────────────────────────────────
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
