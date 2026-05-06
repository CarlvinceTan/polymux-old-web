-- Coalesce per-token thinking entries that were persisted before the
-- backend started merging them at write time (internal/session/trace.go's
-- appendThinking). Anthropic streams thinking as many ThinkingDelta events
-- (token-ish granularity); historically each delta was appended as its own
-- row in metadata.thinking, producing hundreds of identical-action entries
-- per assistant message. The audit UI is now also robust to this, but the
-- judge prompt builder reads the raw array, so cleaner storage = cleaner
-- prompts and smaller rows.
--
-- Merge rule mirrors appendThinking: consecutive entries with the same
-- (action, step) collapse into one entry by concatenating their `detail`.
-- The first entry's `ts` wins (it marks when the block began). A change in
-- action or step breaks the run — e.g. a `tool:*` marker between two
-- `thinking` deltas keeps them as separate blocks.

create or replace function public._coalesce_thinking(arr jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '[]'::jsonb;
  entry jsonb;
  last jsonb;
  last_idx int;
  same boolean;
begin
  if arr is null or jsonb_typeof(arr) <> 'array' then
    return arr;
  end if;

  for entry in select * from jsonb_array_elements(arr) loop
    last_idx := jsonb_array_length(result) - 1;
    if last_idx >= 0 then
      last := result -> last_idx;
      same := coalesce(last->>'action', '') = coalesce(entry->>'action', '')
          and coalesce(last->>'step',   '') = coalesce(entry->>'step',   '');
    else
      same := false;
    end if;

    if same then
      result := jsonb_set(
        result,
        array[last_idx::text],
        jsonb_set(
          last,
          '{detail}',
          to_jsonb(coalesce(last->>'detail', '') || coalesce(entry->>'detail', ''))
        )
      );
    else
      result := result || jsonb_build_array(entry);
    end if;
  end loop;

  return result;
end;
$$;

update public.messages
set metadata = jsonb_set(
  metadata,
  '{thinking}',
  public._coalesce_thinking(metadata->'thinking')
)
where metadata ? 'thinking'
  and jsonb_typeof(metadata->'thinking') = 'array'
  and jsonb_array_length(metadata->'thinking') > 1;

drop function public._coalesce_thinking(jsonb);
