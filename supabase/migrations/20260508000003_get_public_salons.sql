-- ============================================================
-- Migration: 20260508000003_get_public_salons.sql
-- Description: サロン一覧向けに、セラピスト数をDB側で集計して返すRPCを追加
-- ============================================================

create or replace function get_public_salons()
returns table (
  id uuid,
  name text,
  therapist_count int
)
language sql
stable
set search_path = public
as $$
  select
    s.id,
    s.name,
    count(t.id)::int as therapist_count
  from salons s
  left join therapists t
    on t.salon_id = s.id
   and t.deleted_at is null
  where s.deleted_at is null
  group by s.id, s.name
  order by s.name asc;
$$;

grant execute on function get_public_salons()
  to anon, authenticated, service_role;
