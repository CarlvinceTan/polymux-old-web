-- Explicit lowercase storage tag for marketplace URL filters (?tag=storage).
update public.integrations
set tags = case
  when exists (
    select 1 from unnest(coalesce(tags, '{}')) elem
    where lower(elem) = 'storage'
  ) then tags
  else coalesce(tags, '{}') || array['storage']::text[]
end
where slug = 'google-drive';
