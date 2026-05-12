-- ============================================================
-- Migration: 20260512000003_salons_link_external.sql
-- Description:
--   PR-β: 我々の salons と外部ポータル参照 (external_salons) を結合する。
--
--   - salons.external_salon_id を追加 (NULL 許可、論理リンク)。
--     スクレイパ 'link' フェーズが
--       external_salon_bookings.(site_name, shop_id) = (sites.name, salons.shop_id)
--     を辿って自動で埋める。
--   - get_public_salons() を都道府県 / エリア配列付きで返すように更新。
--     フロントの 対応サロン検索 UI が地域絞り込みに使う。
-- ============================================================


-- ============================================================
-- salons に external_salon_id を追加
-- on delete set null: 外部ポータル側で削除されても salons は残す。
-- ============================================================
alter table salons
  add column external_salon_id uuid
    references external_salons(id) on delete set null;

create index idx_salons_external_salon_id
  on salons(external_salon_id)
  where external_salon_id is not null;


-- ============================================================
-- get_public_salons: prefecture / areas を露出する
-- ============================================================
drop function if exists get_public_salons();

create or replace function get_public_salons()
returns table (
  id uuid,
  name text,
  therapist_count int,
  prefecture text,
  areas text[]
)
language sql
stable
set search_path = public
as $$
  select
    s.id,
    s.name,
    count(t.id)::int as therapist_count,
    es.prefecture,
    -- external_salons.areas は not null default '{}' なので coalesce 不要だが、
    -- LEFT JOIN で external_salons が無い場合に NULL になり得るため最終防衛で coalesce。
    coalesce(es.areas, '{}'::text[]) as areas
  from salons s
  left join therapists t
    on t.salon_id = s.id
   and t.deleted_at is null
  left join external_salons es
    on es.id = s.external_salon_id
   and es.deleted_at is null
  where s.deleted_at is null
  group by s.id, s.name, es.prefecture, es.areas
  order by s.name asc;
$$;

grant execute on function get_public_salons()
  to anon, authenticated, service_role;


-- ============================================================
-- link_salons_to_external()
--
-- (sites.name, salons.shop_id) ↔ external_salon_bookings.(site_name, shop_id)
-- 経由で salons.external_salon_id を埋める。
--
-- - 既に external_salon_id が入っている salons は対象外。
-- - 同一 (site_name, shop_id) に複数の external_salons がヒットする場合は
--   external_salons.updated_at が最新のものを採用する。
-- - 戻り値は今回新規にリンクできた件数。
--
-- service_role からのみ呼ばれる想定だが、SECURITY DEFINER は付けない
-- (グラントを service_role に限定)。
-- ============================================================
create or replace function link_salons_to_external(p_limit int default null)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_updated int;
begin
  with candidates as (
    select distinct on (s.id)
      s.id            as salons_id,
      esb.external_salon_id
    from salons s
    join sites st                    on st.id = s.site_id
    join external_salon_bookings esb on esb.site_name = st.name
                                    and esb.shop_id  = s.shop_id
    join external_salons es          on es.id = esb.external_salon_id
                                    and es.deleted_at is null
    where s.deleted_at        is null
      and s.external_salon_id is null
    order by s.id, es.updated_at desc nulls last
    limit case when p_limit is null then null else p_limit end
  ),
  updated as (
    update salons s
       set external_salon_id = c.external_salon_id
      from candidates c
     where s.id = c.salons_id
    returning s.id
  )
  select count(*)::int into v_updated from updated;

  return coalesce(v_updated, 0);
end;
$$;

revoke all on function link_salons_to_external(int) from public;
grant execute on function link_salons_to_external(int) to service_role;
