-- Workspace members cap: hard-block adding seats once a workspace has reached
-- its plan-defined max. The Go API (`POST /workspaces/:id/invitations`) also
-- enforces this at invite-time, but we mirror the cap at the database layer
-- so the final seat-consuming `INSERT` into `workspace_members` cannot slip
-- past the API check (e.g. via the SECURITY DEFINER accept flow, the legacy
-- service-role invite paths, or any future direct insert).
--
-- Numbers must stay in sync with `polymux/internal/session/plan.go` and
-- `web/server/utils/billing/planLimits.ts`. They are duplicated here on purpose:
-- migrations are append-only history, so we hard-code the values that were
-- canonical at the time the migration ran. Future plan-tuning migrations
-- replace the function and trigger together.

create or replace function public.workspace_member_cap_for_plan(p_plan text)
returns int
language sql
immutable
as $$
  select case lower(coalesce(p_plan, 'free'))
    when 'pro'        then 10
    when 'max'        then 50
    when 'enterprise' then 0   -- unlimited
    else                   3   -- free / unknown
  end
$$;

create or replace function public.enforce_workspace_members_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan    text;
  v_cap     int;
  v_current int;
begin
  select plan into v_plan
    from public.workspaces
    where id = new.workspace_id;

  if v_plan is null then
    -- Shouldn't happen — workspace_members.workspace_id is a FK — but be
    -- defensive rather than crash the trigger on data anomalies.
    return new;
  end if;

  v_cap := public.workspace_member_cap_for_plan(v_plan);
  if v_cap <= 0 then
    return new; -- unlimited tier
  end if;

  select count(*) into v_current
    from public.workspace_members
    where workspace_id = new.workspace_id;

  if v_current >= v_cap then
    -- P0001 is the convention used by other workspace RPCs in this repo
    -- (see accept_workspace_invitation), and the message body is a
    -- machine-parsable code the client can branch on.
    raise exception 'workspace_member_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_members_cap on public.workspace_members;
create trigger workspace_members_cap
  before insert on public.workspace_members
  for each row
  execute function public.enforce_workspace_members_cap();

-- Re-create the accept RPC so it returns a clean error code when the cap is
-- hit, instead of surfacing a raw trigger exception. The implementation is
-- otherwise identical to 20260427100000_workspace_invitations.sql.
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
  v_plan         text;
  v_cap          int;
  v_current      int;
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

  -- Re-check the workspace cap inside the same transaction so a race that
  -- bypasses the API guard or trigger gets a clean error here too.
  select plan into v_plan from public.workspaces where id = v_inv.workspace_id;
  v_cap := public.workspace_member_cap_for_plan(v_plan);
  if v_cap > 0 then
    select count(*) into v_current
      from public.workspace_members
      where workspace_id = v_inv.workspace_id;
    if v_current >= v_cap then
      raise exception 'workspace_member_limit_reached' using errcode = 'P0001';
    end if;
  end if;

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
