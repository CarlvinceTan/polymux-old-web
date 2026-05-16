-- Add last_used_by to workspace_passwords so the vault UI can show "Saved by
-- Carl · Last used by Jess, 2 hours ago" instead of only the raw reveal
-- timestamp. The column is a soft reference to auth.users — when a user is
-- removed from the workspace (or deleted), their last_used_by attribution
-- becomes null and the UI falls back to "unknown".

alter table public.workspace_passwords
  add column if not exists last_used_by uuid references auth.users(id) on delete set null;

-- Update the reveal RPC to record both who and when. The function was
-- originally created in 20260418100000_workspace_passwords_vault.sql; this
-- replaces it in place with the same security model (security definer,
-- workspace_members check) plus the new last_used_by write.
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

  update public.workspace_passwords
  set    usage_count  = usage_count + 1,
         last_used_at = now(),
         last_used_by = auth.uid(),
         updated_at   = now()
  where  id = p_password_id;

  select decrypted_secret
  into   v_decrypted
  from   vault.decrypted_secrets
  where  id = v_secret_id;

  return v_decrypted;
end;
$$;
