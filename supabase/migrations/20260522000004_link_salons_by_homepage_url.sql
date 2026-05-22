-- ============================================================
-- Migration: 20260522000004_link_salons_by_homepage_url.sql
-- Description:
--   link_salons_to_external() に「公式サイト URL 完全一致」経路を追加する。
--
--   元々の経路:
--     (sites.name, salons.shop_id) ↔ external_salon_bookings.(site_name, shop_id)
--
--   新規追加経路:
--     normalize_url(salons.homepage_url) = normalize_url(external_salons.homepage_url)
--
--   両方ヒットした場合は homepage_url 経路を優先する。homepage_url は CSV 由来で
--   人手で揃えたマスタ値、shop_id 経路はポータルの自動抽出に依存するため、前者の
--   方が確度が高い。両方とも見つからない場合はリンクなし。
--
--   付帯変更:
--     - normalize_url(text) 関数を新設し、lowercase + trailing slash 除去で
--       表記揺れを吸収する。"http://" vs "https://", "www." 有無は触らない
--       (誤マッチを避けるため厳密側に倒す)。
--     - salons / external_salons に expression index を貼り、結合の速度を確保する。
-- ============================================================


-- ============================================================
-- normalize_url
--   homepage_url 系の表記揺れを吸収する正規化関数。
--   - lowercase 化
--   - 末尾スラッシュ除去
--   STABLE ではなく IMMUTABLE 指定: expression index で使う前提。
-- ============================================================
create or replace function normalize_url(u text) returns text
language sql immutable parallel safe as $$
  select case
    when u is null or u = '' then null
    else lower(rtrim(u, '/'))
  end;
$$;

grant execute on function normalize_url(text) to anon, authenticated, service_role;


-- ============================================================
-- 正規化キー用の expression index
-- 既存の完全一致用 idx_salons_homepage_url / idx_external_salons_homepage_url は
-- そのまま残し、こちらは link 時の join をサポートする。
-- ============================================================
create index if not exists idx_salons_homepage_url_norm
  on salons(normalize_url(homepage_url))
  where homepage_url is not null;

create index if not exists idx_external_salons_homepage_url_norm
  on external_salons(normalize_url(homepage_url))
  where homepage_url is not null;


-- ============================================================
-- link_salons_to_external (homepage_url 経路を OR で追加)
--
-- 候補:
--   経路1 (priority 1, 高確度):
--     normalize_url(salons.homepage_url) = normalize_url(external_salons.homepage_url)
--   経路2 (priority 2):
--     (sites.name, salons.shop_id) ↔ external_salon_bookings.(site_name, shop_id)
--
-- - 既に external_salon_id が入っている salons は対象外。
-- - 同一 salons.id に複数候補がヒットする場合は priority 昇順 →
--   external_salons.updated_at 降順で 1 件採用。
-- - p_limit が指定された場合、候補集合に対して LIMIT を適用する。
-- - 戻り値は今回新規にリンクできた件数。
--
-- service_role からのみ呼ばれる想定 (grant も service_role 限定)。
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
    -- 経路1: 公式サイト URL 完全一致 (正規化キー)
    select
      s.id            as salons_id,
      es.id           as external_salon_id,
      1               as priority,
      es.updated_at
    from salons s
    join external_salons es
      on normalize_url(es.homepage_url) = normalize_url(s.homepage_url)
     and es.deleted_at is null
    where s.deleted_at        is null
      and s.external_salon_id is null
      and s.homepage_url      is not null
      and es.homepage_url     is not null

    union all

    -- 経路2: 予約システム shop_id 経路 (ポータルの自動抽出由来)
    select
      s.id,
      esb.external_salon_id,
      2,
      es.updated_at
    from salons s
    join sites st                    on st.id = s.site_id
    join external_salon_bookings esb on esb.site_name = st.name
                                    and esb.shop_id  = s.shop_id
    join external_salons es          on es.id = esb.external_salon_id
                                    and es.deleted_at is null
    where s.deleted_at        is null
      and s.external_salon_id is null
  ),
  ranked as (
    select distinct on (salons_id)
      salons_id,
      external_salon_id
    from candidates
    order by salons_id, priority asc, updated_at desc nulls last
    limit case when p_limit is null then null else p_limit end
  ),
  updated as (
    update salons s
       set external_salon_id = r.external_salon_id
      from ranked r
     where s.id = r.salons_id
    returning s.id
  )
  select count(*)::int into v_updated from updated;

  return coalesce(v_updated, 0);
end;
$$;

revoke all on function link_salons_to_external(int) from public;
grant execute on function link_salons_to_external(int) to service_role;
