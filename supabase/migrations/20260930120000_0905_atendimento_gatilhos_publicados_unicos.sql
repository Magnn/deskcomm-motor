-- 0905 — um gatilho de palavra só pode pertencer a um fluxo de atendimento ativo.
-- Serializa publicações da mesma organização para impedir corrida entre dois publishes.
create or replace function fn_publish_followup_flow_version(
  p_org uuid,
  p_pointer uuid,
  p_graph jsonb,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pointer record;
  v_version_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 0));

  select p.id, p.organization_id, p.surface
    into v_pointer
  from followup_flow_pointers p
  where p.id = p_pointer
  for update;

  if not found or v_pointer.organization_id <> p_org then
    raise exception 'pointer_not_found' using errcode = 'P0001';
  end if;

  if v_pointer.surface = 'atendimento' and exists (
    select 1
      from followup_flow_pointers p
      join followup_flow_versions v
        on v.id = p.active_version_id
       and v.organization_id = p.organization_id
      cross join lateral jsonb_array_elements_text(
        coalesce(v.graph #> '{settings,gatilhos}', '[]'::jsonb)
      ) as existing_trigger(value)
      cross join lateral jsonb_array_elements_text(
        coalesce(p_graph #> '{settings,gatilhos}', '[]'::jsonb)
      ) as incoming_trigger(value)
     where p.organization_id = p_org
       and p.surface = 'atendimento'
       and p.status = 'active'
       and p.id <> p_pointer
       and translate(
         regexp_replace(lower(trim(existing_trigger.value)), '[[:space:]]+', ' ', 'g'),
         'áàãâäéèêëíìîïóòõôöúùûüç',
         'aaaaaeeeeiiiiooooouuuuc'
       ) = translate(
         regexp_replace(lower(trim(incoming_trigger.value)), '[[:space:]]+', ' ', 'g'),
         'áàãâäéèêëíìîïóòõôöúùûüç',
         'aaaaaeeeeiiiiooooouuuuc'
       )
  ) then
    raise exception 'trigger_conflict' using errcode = 'P0001';
  end if;

  insert into followup_flow_versions (organization_id, pointer_id, graph, created_by)
  values (p_org, p_pointer, p_graph, p_created_by)
  returning id into v_version_id;

  update followup_flow_pointers
     set active_version_id = v_version_id,
         status = 'active',
         updated_at = now()
   where id = p_pointer;

  return v_version_id;
end;
$$;

revoke all on function fn_publish_followup_flow_version(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
