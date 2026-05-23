-- ============================================================
-- Migration: 20260524000000_coverage_stats.sql
-- Description:
--   apps/dashboard の /coverage ページ向けに「サロン / セラピストの
--   各項目カバレッジ」「サロン状況の分類」「エリア別カバレッジ」
--   「自社マスタに未投入の外部サロン候補 (orphans)」を集計する
--   read-only RPC をまとめて定義する。
--
--   全関数とも:
--     - language sql / stable / set search_path = public
--     - service_role にのみ grant（anon / authenticated には公開しない）
--     - 戻り値は集計済みテーブル
--     - 同一テーブルは count(*) filter (...) で 1 scan に畳む
--       (20260522000007_dashboard_stats_perf.sql の方針に合わせる)
--
--   関数一覧:
--     stats_salons_coverage()
--     stats_salons_status()
--     stats_therapists_coverage()
--     stats_areas_coverage()
--     stats_external_salons_orphans(p_limit)
-- ============================================================


-- ============================================================
-- stats_salons_coverage
--   salons (自社マスタ) と external_salons (men-esthe.jp 由来) の
--   項目別カバレッジを 1 行で返す。
--
--   - salons_* : 自社マスタ側の埋まり具合
--   - linked_with_* : external_salon_id で結ばれた active salon が
--                     external_salons 側の各項目から実際に補完できている件数
--   - ex_with_* : external_salons 単体のカバレッジ (ポータル取得品質)
--   - ex_with_bookings : external_salon_bookings に >= 1 行ある external_salons 数
-- ============================================================
create or replace function public.stats_salons_coverage()
returns table (
  salons_active                       int,
  salons_with_url                     int,
  salons_with_homepage_url            int,
  salons_linked_external              int,
  salons_never_synced                 int,
  salons_stale_synced                 int,
  linked_external_salons_active       int,
  linked_with_prefecture              int,
  linked_with_areas                   int,
  linked_with_nearest_stations        int,
  linked_with_genre                   int,
  linked_with_price_range             int,
  linked_with_opening_hours           int,
  linked_with_homepage_url            int,
  ex_active                           int,
  ex_with_prefecture                  int,
  ex_with_areas                       int,
  ex_with_nearest_stations            int,
  ex_with_genre                       int,
  ex_with_price_range                 int,
  ex_with_opening_hours               int,
  ex_with_homepage_url                int,
  ex_with_bookings                    int
)
language sql
stable
set search_path = public
as $$
  with s as (
    select
      count(*) filter (where deleted_at is null)::int as active,
      count(*) filter (where deleted_at is null and url is not null)::int as with_url,
      count(*) filter (where deleted_at is null and homepage_url is not null)::int as with_homepage_url,
      count(*) filter (
        where deleted_at is null and external_salon_id is not null
      )::int as linked,
      count(*) filter (where deleted_at is null and last_synced_at is null)::int as never_synced,
      count(*) filter (
        where deleted_at is null
          and last_synced_at is not null
          and last_synced_at < now() - interval '7 days'
      )::int as stale_synced
    from public.salons
  ),
  linked_enrich as (
    select
      count(*)::int as total,
      count(*) filter (where es.prefecture is not null)::int as with_prefecture,
      count(*) filter (where cardinality(es.areas) > 0)::int as with_areas,
      count(*) filter (where cardinality(es.nearest_stations) > 0)::int as with_nearest_stations,
      count(*) filter (where es.genre is not null)::int as with_genre,
      count(*) filter (where es.price_range is not null)::int as with_price_range,
      count(*) filter (where es.opening_hours is not null)::int as with_opening_hours,
      count(*) filter (where es.homepage_url is not null)::int as with_homepage_url
    from public.salons sa
    join public.external_salons es on es.id = sa.external_salon_id
    where sa.deleted_at is null
      and sa.external_salon_id is not null
      and es.deleted_at is null
  ),
  es as (
    select
      count(*) filter (where deleted_at is null)::int as active,
      count(*) filter (where deleted_at is null and prefecture is not null)::int as with_prefecture,
      count(*) filter (where deleted_at is null and cardinality(areas) > 0)::int as with_areas,
      count(*) filter (
        where deleted_at is null and cardinality(nearest_stations) > 0
      )::int as with_nearest_stations,
      count(*) filter (where deleted_at is null and genre is not null)::int as with_genre,
      count(*) filter (where deleted_at is null and price_range is not null)::int as with_price_range,
      count(*) filter (where deleted_at is null and opening_hours is not null)::int as with_opening_hours,
      count(*) filter (where deleted_at is null and homepage_url is not null)::int as with_homepage_url
    from public.external_salons
  ),
  bookings as (
    -- external_salon_bookings に >= 1 行ある active external_salon の数
    select count(*)::int as cnt
    from (
      select esb.external_salon_id
      from public.external_salon_bookings esb
      join public.external_salons es on es.id = esb.external_salon_id
      where es.deleted_at is null
      group by esb.external_salon_id
    ) t
  )
  select
    s.active, s.with_url, s.with_homepage_url, s.linked, s.never_synced, s.stale_synced,
    linked_enrich.total,
    linked_enrich.with_prefecture,
    linked_enrich.with_areas,
    linked_enrich.with_nearest_stations,
    linked_enrich.with_genre,
    linked_enrich.with_price_range,
    linked_enrich.with_opening_hours,
    linked_enrich.with_homepage_url,
    es.active,
    es.with_prefecture,
    es.with_areas,
    es.with_nearest_stations,
    es.with_genre,
    es.with_price_range,
    es.with_opening_hours,
    es.with_homepage_url,
    bookings.cnt
  from s, linked_enrich, es, bookings;
$$;


-- ============================================================
-- stats_salons_status
--   salons を 6 つの排他バケットに分類し、カテゴリ別件数を返す。
--
--   優先順 (上から順に当てはまった行をそのカテゴリに入れる):
--     1. closed_internal       : salons.deleted_at が立っている
--     2. closed_external       : external 側で論理削除済み (=ポータル 404 / canonical 不一致)
--                                → 次の論理削除候補
--     3. never_synced          : Stage 2 (therapists 同期) が一度も走っていない
--     4. stale_synced          : last_synced_at が 7 日以上前 (Stage 2 故障の疑い)
--     5. active_no_therapists  : 直近同期済みなのに在籍セラピストが 0 (= 閉店疑い)
--     6. active_with_therapists: 正常稼働
--
--   常に 6 カテゴリ分の row が並ぶ (0 件のときも row は出す) ので、
--   UI 側で順序を保ったまま並べやすい。
-- ============================================================
create or replace function public.stats_salons_status()
returns table (
  category text,
  cnt      int
)
language sql
stable
set search_path = public
as $$
  with t_counts as (
    select
      salon_id,
      count(*) filter (where deleted_at is null)::int as active_cnt
    from public.therapists
    group by salon_id
  ),
  classified as (
    select
      case
        when s.deleted_at is not null then 'closed_internal'
        when s.external_salon_id is not null and es.deleted_at is not null then 'closed_external'
        when s.last_synced_at is null then 'never_synced'
        when s.last_synced_at < now() - interval '7 days' then 'stale_synced'
        when coalesce(tc.active_cnt, 0) = 0 then 'active_no_therapists'
        else 'active_with_therapists'
      end as category
    from public.salons s
    left join public.external_salons es on es.id = s.external_salon_id
    left join t_counts tc on tc.salon_id = s.id
  ),
  categories(category) as (
    values
      ('active_with_therapists'),
      ('active_no_therapists'),
      ('stale_synced'),
      ('never_synced'),
      ('closed_external'),
      ('closed_internal')
  ),
  aggregated as (
    select category, count(*)::int as cnt
    from classified
    group by category
  )
  select
    c.category,
    coalesce(a.cnt, 0)::int as cnt
  from categories c
  left join aggregated a on a.category = c.category;
$$;


-- ============================================================
-- stats_therapists_coverage
--   therapists (自社マスタ) と external_therapists (men-esthe.jp 由来) の
--   項目別カバレッジを 1 行で返す。
--
--   - t_* : 自社 therapists の埋まり具合
--   - linked_with_* : external_therapist_id で結ばれた active therapist が
--                     external_therapists 側の各項目から補完できている件数
--   - ex_* : external_therapists 単体のカバレッジ + status 内訳
-- ============================================================
create or replace function public.stats_therapists_coverage()
returns table (
  therapists_active               int,
  t_with_profile_url              int,
  t_with_image_url                int,
  t_with_description              int,
  t_with_age                      int,
  t_with_height                   int,
  t_with_bwh                      int,
  t_with_cup                      int,
  t_linked_external               int,
  t_never_synced                  int,
  t_stale_synced                  int,
  linked_total                    int,
  linked_with_age                 int,
  linked_with_height              int,
  linked_with_cup                 int,
  linked_with_image               int,
  linked_with_therapist_url       int,
  linked_with_comment             int,
  external_therapists_active      int,
  ex_with_age                     int,
  ex_with_height                  int,
  ex_with_cup                     int,
  ex_with_image                   int,
  ex_with_therapist_url           int,
  ex_with_comment                 int,
  ex_with_kana                    int,
  ex_status_active                int,
  ex_status_retired               int
)
language sql
stable
set search_path = public
as $$
  with t as (
    select
      count(*) filter (where deleted_at is null)::int as active,
      count(*) filter (where deleted_at is null and profile_url is not null)::int as with_profile_url,
      count(*) filter (where deleted_at is null and image_url is not null)::int as with_image_url,
      count(*) filter (where deleted_at is null and description is not null)::int as with_description,
      count(*) filter (where deleted_at is null and age is not null)::int as with_age,
      count(*) filter (where deleted_at is null and height is not null)::int as with_height,
      count(*) filter (
        where deleted_at is null
          and bust is not null and waist is not null and hip is not null
      )::int as with_bwh,
      count(*) filter (where deleted_at is null and cup is not null)::int as with_cup,
      count(*) filter (
        where deleted_at is null and external_therapist_id is not null
      )::int as linked_external,
      count(*) filter (where deleted_at is null and last_synced_at is null)::int as never_synced,
      count(*) filter (
        where deleted_at is null
          and last_synced_at is not null
          and last_synced_at < now() - interval '7 days'
      )::int as stale_synced
    from public.therapists
  ),
  linked_enrich as (
    select
      count(*)::int as total,
      count(*) filter (where et.age is not null)::int as with_age,
      count(*) filter (where et.height is not null)::int as with_height,
      count(*) filter (where et.cup is not null)::int as with_cup,
      count(*) filter (where cardinality(et.image_urls) > 0)::int as with_image,
      count(*) filter (where et.therapist_url is not null)::int as with_therapist_url,
      count(*) filter (where et.comment is not null)::int as with_comment
    from public.therapists th
    join public.external_therapists et on et.id = th.external_therapist_id
    where th.deleted_at is null
      and th.external_therapist_id is not null
      and et.deleted_at is null
  ),
  et as (
    select
      count(*) filter (where deleted_at is null)::int as active,
      count(*) filter (where deleted_at is null and age is not null)::int as with_age,
      count(*) filter (where deleted_at is null and height is not null)::int as with_height,
      count(*) filter (where deleted_at is null and cup is not null)::int as with_cup,
      count(*) filter (where deleted_at is null and cardinality(image_urls) > 0)::int as with_image,
      count(*) filter (where deleted_at is null and therapist_url is not null)::int as with_therapist_url,
      count(*) filter (where deleted_at is null and comment is not null)::int as with_comment,
      count(*) filter (where deleted_at is null and kana is not null)::int as with_kana,
      count(*) filter (where deleted_at is null and status = 1)::int as status_active,
      count(*) filter (where deleted_at is null and status = 2)::int as status_retired
    from public.external_therapists
  )
  select
    t.active,
    t.with_profile_url, t.with_image_url, t.with_description,
    t.with_age, t.with_height, t.with_bwh, t.with_cup,
    t.linked_external, t.never_synced, t.stale_synced,
    linked_enrich.total,
    linked_enrich.with_age, linked_enrich.with_height, linked_enrich.with_cup,
    linked_enrich.with_image, linked_enrich.with_therapist_url, linked_enrich.with_comment,
    et.active,
    et.with_age, et.with_height, et.with_cup,
    et.with_image, et.with_therapist_url, et.with_comment, et.with_kana,
    et.status_active, et.status_retired
  from t, linked_enrich, et;
$$;


-- ============================================================
-- stats_areas_coverage
--   external_salons.prefecture ごとに、ポータルに何件あり、そのうち
--   自社 salons とリンク済みが何件かを返す。
--
--   注: 1 つの external_salon に複数 salons が紐づくケース (caskan/grow
--   併用等) があるため、件数の数え方は「external_salon ベース」で揃える。
--   linked_count は『その external_salon に紐づく active salon が 1 件以上』
--   である external_salon の数。
-- ============================================================
create or replace function public.stats_areas_coverage()
returns table (
  prefecture          text,
  external_count      int,
  linked_count        int,
  unlinked_count      int
)
language sql
stable
set search_path = public
as $$
  with link as (
    select
      external_salon_id,
      count(*) filter (where deleted_at is null)::int as cnt
    from public.salons
    where external_salon_id is not null
    group by external_salon_id
  )
  select
    coalesce(es.prefecture, '(未分類)') as prefecture,
    count(*)::int as external_count,
    count(*) filter (where coalesce(link.cnt, 0) > 0)::int as linked_count,
    count(*) filter (where coalesce(link.cnt, 0) = 0)::int as unlinked_count
  from public.external_salons es
  left join link on link.external_salon_id = es.id
  where es.deleted_at is null
  group by coalesce(es.prefecture, '(未分類)')
  order by count(*) desc, coalesce(es.prefecture, '(未分類)');
$$;


-- ============================================================
-- stats_external_salons_orphans
--   external_salons のうち、自社 salons にまだ取り込めていない (=リンク
--   先がない) かつ external_salon_bookings に >= 1 行ある (=予約システム
--   が判明している) サロンを「追加投入候補」として上位 N 件返す。
--
--   ordering:
--     bookings_count desc, ex_updated_at desc
--   理由:
--     bookings が複数併用 (= 規模が大きい) なほど追加価値が高い & 同点なら
--     ポータル側 updated_at が新しい (=情報が新鮮) ものを優先する。
-- ============================================================
create or replace function public.stats_external_salons_orphans(
  p_limit int default 20
)
returns table (
  external_salon_id   uuid,
  name                text,
  prefecture          text,
  homepage_url        text,
  source_url          text,
  bookings_count      int,
  site_names          text[]
)
language sql
stable
set search_path = public
as $$
  select
    es.id              as external_salon_id,
    es.name            as name,
    es.prefecture      as prefecture,
    es.homepage_url    as homepage_url,
    es.source_url      as source_url,
    count(*)::int      as bookings_count,
    array_agg(distinct esb.site_name order by esb.site_name) as site_names
  from public.external_salons es
  join public.external_salon_bookings esb on esb.external_salon_id = es.id
  where es.deleted_at is null
    and not exists (
      select 1
      from public.salons s
      where s.external_salon_id = es.id
        and s.deleted_at is null
    )
  group by es.id, es.name, es.prefecture, es.homepage_url, es.source_url, es.updated_at
  order by count(*) desc, es.updated_at desc
  limit greatest(p_limit, 1);
$$;


-- ============================================================
-- grant: service_role のみ。anon / authenticated には公開しない。
-- ============================================================
revoke all on function public.stats_salons_coverage()                  from public;
revoke all on function public.stats_salons_status()                    from public;
revoke all on function public.stats_therapists_coverage()              from public;
revoke all on function public.stats_areas_coverage()                   from public;
revoke all on function public.stats_external_salons_orphans(int)       from public;

grant execute on function public.stats_salons_coverage()               to service_role;
grant execute on function public.stats_salons_status()                 to service_role;
grant execute on function public.stats_therapists_coverage()           to service_role;
grant execute on function public.stats_areas_coverage()                to service_role;
grant execute on function public.stats_external_salons_orphans(int)    to service_role;
