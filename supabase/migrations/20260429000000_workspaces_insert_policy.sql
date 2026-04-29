-- Restore the ability for an authenticated user to create their own workspace.
-- The previous INSERT policy on public.workspaces (defined in an earlier
-- migration that's no longer in-tree) rejected `INSERT INTO workspaces` from
-- the API server with code 42501 even though the row carries
-- `created_by = auth.uid()`. The Go API server already forwards the user's JWT
-- and writes `created_by` from the authenticated subject, so the simplest
-- correct policy is "the row's created_by must equal auth.uid()".

alter table public.workspaces enable row level security;

drop policy if exists "workspaces_insert_self" on public.workspaces;
drop policy if exists "Authenticated users can create workspaces" on public.workspaces;
drop policy if exists "Users can create workspaces" on public.workspaces;
drop policy if exists "workspaces_insert" on public.workspaces;

create policy "workspaces_insert_self"
  on public.workspaces for insert
  to authenticated
  with check (created_by = auth.uid());
