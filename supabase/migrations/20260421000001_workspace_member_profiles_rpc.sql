CREATE OR REPLACE FUNCTION public.list_workspace_members_with_profiles(ws_id uuid)
RETURNS TABLE (
  workspace_id uuid,
  user_id uuid,
  role workspace_role,
  invited_by uuid,
  joined_at timestamptz,
  email text,
  display_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.invited_by,
    wm.joined_at,
    u.email::text AS email,
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(split_part(u.email::text, '@', 1), '')
    ) AS display_name
  FROM public.workspace_members wm
  LEFT JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = ws_id
    AND public.is_workspace_member(ws_id)
  ORDER BY wm.joined_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_workspace_members_with_profiles(uuid) TO authenticated;
