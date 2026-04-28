-- Workspace invitations: pending email-based invites that turn into
-- workspace_members rows once accepted. The token is the bearer used by the
-- accept link emailed to the invitee; resending an invitation regenerates the
-- token and bumps expires_at. Revoke deletes the row outright.
--
-- Acceptance is intentionally not wired up in this migration's RLS — that flow
-- runs through a SECURITY DEFINER RPC (or backend service role) so the invitee
-- can convert the row to membership without first being a workspace member.
-- The policies below cover only the management surface used by owners/admins.

create table if not exists public.workspace_invitations (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  email        text        not null,
  role         text        not null default 'member' check (role in ('admin', 'member')),
  token        text        not null unique,
  invited_by   uuid        not null references auth.users(id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  accepted_by  uuid        references auth.users(id),
  unique (workspace_id, email)
);

create index if not exists idx_workspace_invitations_workspace
  on public.workspace_invitations(workspace_id);

create index if not exists idx_workspace_invitations_email
  on public.workspace_invitations(email);

create index if not exists idx_workspace_invitations_token
  on public.workspace_invitations(token);

alter table public.workspace_invitations enable row level security;

-- Owners and admins of the workspace can see pending invitations.
create policy "workspace_admins_read_invitations"
  on public.workspace_invitations for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invitations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace_admins_insert_invitations"
  on public.workspace_invitations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invitations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace_admins_update_invitations"
  on public.workspace_invitations for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invitations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invitations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

create policy "workspace_admins_delete_invitations"
  on public.workspace_invitations for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invitations.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- Accept flow runs as SECURITY DEFINER because the invitee isn't a workspace
-- member yet, so they can't see their own row through the RLS policies above.
-- The function validates that the caller's email matches the invited email
-- (case-insensitive) and that the invitation hasn't expired or been used.
-- Errors carry machine-readable codes the client can branch on.
create or replace function public.accept_workspace_invitation(invite_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv          public.workspace_invitations;
  v_caller       uuid := auth.uid();
  v_caller_email text;
begin
  if v_caller is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select email into v_caller_email from auth.users where id = v_caller;
  if v_caller_email is null then
    raise exception 'no_email_on_account' using errcode = 'P0001';
  end if;

  select * into v_inv
  from public.workspace_invitations
  where token = invite_token
  for update;

  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_accepted' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if lower(v_inv.email) <> lower(v_caller_email) then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  -- Idempotent insert: re-accepting (e.g. after a refresh) is a no-op rather
  -- than an error, since the user is then already a member.
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v_inv.workspace_id, v_caller, v_inv.role, v_inv.invited_by)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
    set accepted_at = now(),
        accepted_by = v_caller
    where id = v_inv.id;

  return json_build_object(
    'workspace_id', v_inv.workspace_id,
    'role',         v_inv.role
  );
end;
$$;

revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

-- Expose the bare-minimum invitation preview (no token, no internal IDs) to
-- a signed-in user trying to view what they're about to accept. RLS on the
-- table itself blocks this — invitees aren't members of the workspace yet —
-- so the lookup runs as SECURITY DEFINER and only returns fields a recipient
-- already knows from their email.
create or replace function public.peek_workspace_invitation(invite_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv  public.workspace_invitations;
  v_ws   public.workspaces;
begin
  select * into v_inv from public.workspace_invitations where token = invite_token;
  if not found then
    return null;
  end if;
  select * into v_ws from public.workspaces where id = v_inv.workspace_id;
  if not found then
    return null;
  end if;
  return json_build_object(
    'email',          v_inv.email,
    'role',           v_inv.role,
    'expires_at',     v_inv.expires_at,
    'accepted_at',    v_inv.accepted_at,
    'workspace_name', v_ws.name
  );
end;
$$;

revoke all on function public.peek_workspace_invitation(text) from public;
grant execute on function public.peek_workspace_invitation(text) to authenticated;
grant execute on function public.peek_workspace_invitation(text) to anon;
