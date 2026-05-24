-- ============================================================
-- Migration: 20260524000001_scraper_target_rpcs.sql
-- Description:
--   Stage 3 (availability) / Stage 5 (official_shifts) Lambda の
--   「対象セラピスト一覧取得」を PostgREST 埋め込み JOIN から
--   サーバ側 RPC に置き換える。
--
--   置き換え前は PostgREST が
--     therapists?select=id,...,salons!inner(...,sites!inner(...)),
--                       watch_settings!inner(...)
--   のような多階層 LATERAL + json_agg + ORDER BY を生成していたため、
--   work_mem (Micro plan で約 2 MB) に収まらずディスクソート
--   (temp_blks 数百万 / 1 回) を発生させ、Disk IO Budget 枯渇の
--   主犯になっていた。
--
--   起点を therapists (5 万行) → watch_settings (数十行) に反転し、
--   PostgREST 経由を排して planner に最短経路を選ばせる。
--
--   関数一覧:
--     get_watch_availability_targets()
--     get_research_availability_targets()
--     count_research_excluded_watched()
--     get_official_shifts_targets()
--
--   全関数とも:
--     - language sql / stable / set search_path = public
--     - service_role にのみ grant (anon / authenticated には公開しない)
--     - 戻り値は scraper が直接そのまま使える形に整形済み
-- ============================================================


-- ============================================================
-- get_watch_availability_targets
--   Stage 3 watch モードの対象セラピストを返す。
--
--   対象条件:
--     - watch_settings.is_active = true かつ deleted_at is null
--     - 紐づく therapists / salons の deleted_at が null
--
--   並び順は last_synced_at の古い順 (NULLS FIRST)。
--   サイト直列キューが詰まりやすいセラピスト (= 久しく取れていない)
--   から優先的に処理する従来の挙動を維持する。
--
--   1 セラピストに複数の watch_settings がぶら下がるケースを
--   distinct on で 1 行に潰す (= 旧コードのメモリ重複排除と等価)。
-- ============================================================
create or replace function public.get_watch_availability_targets()
returns table (
  id             uuid,
  therapist_id   text,
  name           text,
  salon_id       uuid,
  salon_shop_id  text,
  site_name      text
)
language sql
stable
set search_path = public
as $$
  select distinct on (t.id)
    t.id,
    t.therapist_id,
    t.name,
    t.salon_id,
    s.shop_id   as salon_shop_id,
    si.name     as site_name
  from public.watch_settings ws
  join public.therapists t on t.id = ws.therapist_id and t.deleted_at is null
  join public.salons     s on s.id = t.salon_id     and s.deleted_at is null
  join public.sites     si on si.id = s.site_id
  where ws.deleted_at is null
    and ws.is_active  = true
  order by t.id, t.last_synced_at asc nulls first;
$$;


-- ============================================================
-- get_research_availability_targets
--   Stage 3 research モードの対象セラピストを返す。
--
--   対象条件:
--     - salons.research_enabled = true かつ deleted_at is null
--     - therapists.deleted_at is null
--     - watch_settings に有効行を持つセラピストは除外
--       (理由: 毎分実行の watch 側 Lambda が責務を持ち、research が
--        先回りすると previous_is_available 上書きで差分検知を奪う)
--
--   並び順は watch 版と同じく last_synced_at NULLS FIRST。
-- ============================================================
create or replace function public.get_research_availability_targets()
returns table (
  id             uuid,
  therapist_id   text,
  name           text,
  salon_id       uuid,
  salon_shop_id  text,
  site_name      text
)
language sql
stable
set search_path = public
as $$
  select
    t.id,
    t.therapist_id,
    t.name,
    t.salon_id,
    s.shop_id   as salon_shop_id,
    si.name     as site_name
  from public.therapists t
  join public.salons     s on s.id = t.salon_id     and s.deleted_at is null
  join public.sites     si on si.id = s.site_id
  where t.deleted_at is null
    and s.research_enabled = true
    and not exists (
      select 1
      from public.watch_settings ws
      where ws.therapist_id = t.id
        and ws.deleted_at is null
        and ws.is_active  = true
    )
  order by t.last_synced_at asc nulls first;
$$;


-- ============================================================
-- count_research_excluded_watched
--   research モードで「watch 配下と被って除外した」人数を返す。
--
--   旧実装ではこの値を「research 全件取得 + watch 全件取得を
--   メモリで集合演算」して算出していたが、対象が watch 18 行 vs
--   research 5 万行という極端な比率なので、サーバ側の単一 SQL に
--   寄せた方が IO も RTT も大幅に節約できる。
--
--   ログ用途のため戻り値はスカラ int。
-- ============================================================
create or replace function public.count_research_excluded_watched()
returns int
language sql
stable
set search_path = public
as $$
  select count(distinct t.id)::int
  from public.therapists t
  join public.salons        s on s.id = t.salon_id
  join public.watch_settings ws on ws.therapist_id = t.id
  where t.deleted_at is null
    and s.deleted_at is null
    and s.research_enabled = true
    and ws.deleted_at is null
    and ws.is_active  = true;
$$;


-- ============================================================
-- get_official_shifts_targets
--   Stage 5 (official_shifts) の対象セラピストを返す。
--
--   対象条件:
--     - watch_settings.is_active = true かつ deleted_at is null
--     - therapists が external_therapists にリンク済み
--       (external_therapist_id is not null)
--     - external_therapists.deleted_at is null かつ
--       therapist_url is not null
--
--   distinct on (t.id) で「複数 watch_settings がぶら下がるセラピスト」を
--   1 行に畳む。
-- ============================================================
create or replace function public.get_official_shifts_targets()
returns table (
  internal_therapist_id  uuid,
  external_therapist_id  uuid,
  therapist_url          text,
  therapist_name         text
)
language sql
stable
set search_path = public
as $$
  select distinct on (t.id)
    t.id   as internal_therapist_id,
    et.id  as external_therapist_id,
    et.therapist_url,
    t.name as therapist_name
  from public.watch_settings ws
  join public.therapists           t on t.id  = ws.therapist_id and t.deleted_at is null
  join public.external_therapists et on et.id = t.external_therapist_id
  where ws.deleted_at is null
    and ws.is_active  = true
    and t.external_therapist_id is not null
    and et.deleted_at is null
    and et.therapist_url is not null
  order by t.id, t.last_synced_at asc nulls first;
$$;


-- ============================================================
-- grant: service_role のみ。anon / authenticated には公開しない。
-- ============================================================
revoke all on function public.get_watch_availability_targets()       from public;
revoke all on function public.get_research_availability_targets()    from public;
revoke all on function public.count_research_excluded_watched()      from public;
revoke all on function public.get_official_shifts_targets()          from public;

grant execute on function public.get_watch_availability_targets()    to service_role;
grant execute on function public.get_research_availability_targets() to service_role;
grant execute on function public.count_research_excluded_watched()   to service_role;
grant execute on function public.get_official_shifts_targets()       to service_role;
