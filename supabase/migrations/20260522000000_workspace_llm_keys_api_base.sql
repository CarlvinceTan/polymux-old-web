-- Optional custom provider base URL for BYOK keys.
-- NULL/empty means "use the server-configured default for this provider".

alter table public.workspace_llm_keys
  add column if not exists api_base text;

comment on column public.workspace_llm_keys.api_base is
  'Optional custom LLM provider base URL (https only). Empty uses the server default.';
