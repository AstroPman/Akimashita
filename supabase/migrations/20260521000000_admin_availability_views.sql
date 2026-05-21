-- ============================================================
-- Migration: 20260521000000_admin_availability_views.sql
-- Description:
--   管理者向けダッシュボード (apps/dashboard, ローカル限定運用) 用に、
--   予約枠の状態遷移ログ表示と「過去日付なのに空き続けている枠」検出のための
--   read-only な集計 RPC を追加する。
--
--   既存の stats_availability_events_recent はそのまま残し、より詳細な
--   横断タイムラインと、availability テーブルの放置空き検出を追加する。
--
--   全関数とも:
--     - language sql / stable / set search_path = public
--     - service_role にのみ grant（anon / authenticated には公開しない）
--
--   関数一覧:
--     stats_availability_events_feed(p_hours, p_limit, p_event_types,
--                                    p_site_id, p_salon_id, p_therapist_id)
--     stats_stale_open_slots_overview()
--     stats_stale_open_slots_by_salon(p_limit)
--     stats_stale_open_slots_list(p_limit)
-- ============================================================


-- ============================================================
-- availability_events の横断タイムライン
--   - 直近 p_hours のイベントを occurred_at desc で返す
--   - therapist / salon / site と JOIN して名称解決する
--   - event_type / site / salon / therapist による絞り込みは
--     null 渡しで「フィルタしない」を意味する
-- ============================================================
create or replace function public.stats_availability_events_feed(
  p_hours int default 24,
  p_limit int default 200,
  p_event_types text[] default null,
  p_site_id uuid default null,
  p_salon_id uuid default null,
  p_therapist_id uuid default null
)
returns table (
  occurred_at      timestamptz,
  event_type       text,
  therapist_id     uuid,
  therapist_name   text,
  salon_id         uuid,
  salon_name       text,
  site_name        text,
  slot_date        date,
  start_time       time
)
language sql
stable
set search_path = public
as $$
  select
    ae.occurred_at,
    ae.event_type,
    ae.therapist_id,
    t.name        as therapist_name,
    sa.id         as salon_id,
    sa.name       as salon_name,
    si.name       as site_name,
    ae.date       as slot_date,
    ae.start_time
  from public.availability_events ae
  join public.therapists t  on t.id  = ae.therapist_id
  join public.salons     sa on sa.id = t.salon_id
  join public.sites      si on si.id = sa.site_id
  where ae.occurred_at >= now() - make_interval(hours => p_hours)
    and (p_event_types is null or ae.event_type = any(p_event_types))
    and (p_site_id      is null or si.id = p_site_id)
    and (p_salon_id     is null or sa.id = p_salon_id)
    and (p_therapist_id is null or t.id  = p_therapist_id)
  order by ae.occurred_at desc
  limit greatest(p_limit, 1);
$$;


-- ============================================================
-- 過去日付なのに is_available = true のままになっている枠の総覧
--   - 「過去」の判定は JST 基準（既存ダッシュボードの表示と合わせる）
--   - 削除済み therapist / salon は除外
-- ============================================================
create or replace function public.stats_stale_open_slots_overview()
returns table (
  total_count               bigint,
  affected_salon_count      bigint,
  affected_therapist_count  bigint,
  oldest_date               date
)
language sql
stable
set search_path = public
as $$
  select
    count(*)::bigint                          as total_count,
    count(distinct t.salon_id)::bigint        as affected_salon_count,
    count(distinct av.therapist_id)::bigint   as affected_therapist_count,
    min(av.date)                              as oldest_date
  from public.availability av
  join public.therapists t  on t.id  = av.therapist_id
  join public.salons     sa on sa.id = t.salon_id
  where av.is_available = true
    and av.date < (now() at time zone 'Asia/Tokyo')::date
    and t.deleted_at  is null
    and sa.deleted_at is null;
$$;


-- ============================================================
-- 過去日付の放置空き枠をサロン単位で集計（ワーストランキング）
--   - stale_count desc, oldest_date asc で「ずさん度が高い」順
-- ============================================================
create or replace function public.stats_stale_open_slots_by_salon(
  p_limit int default 50
)
returns table (
  salon_id                  uuid,
  salon_name                text,
  site_name                 text,
  stale_count               int,
  affected_therapist_count  int,
  oldest_date               date
)
language sql
stable
set search_path = public
as $$
  select
    sa.id                                    as salon_id,
    sa.name                                  as salon_name,
    si.name                                  as site_name,
    count(*)::int                            as stale_count,
    count(distinct av.therapist_id)::int     as affected_therapist_count,
    min(av.date)                             as oldest_date
  from public.availability av
  join public.therapists t  on t.id  = av.therapist_id
  join public.salons     sa on sa.id = t.salon_id
  join public.sites      si on si.id = sa.site_id
  where av.is_available = true
    and av.date < (now() at time zone 'Asia/Tokyo')::date
    and t.deleted_at  is null
    and sa.deleted_at is null
  group by sa.id, sa.name, si.name
  order by count(*) desc, min(av.date) asc, sa.name asc
  limit greatest(p_limit, 1);
$$;


-- ============================================================
-- 過去日付の放置空き枠の個別リスト（古い順）
--   - 何日放置されているかを呼び出し側で計算できるよう
--     slot_date / last_state_change_at / first_seen_at を返す
-- ============================================================
create or replace function public.stats_stale_open_slots_list(
  p_limit int default 200
)
returns table (
  therapist_id           uuid,
  therapist_name         text,
  salon_id               uuid,
  salon_name             text,
  site_name              text,
  slot_date              date,
  start_time             time,
  last_state_change_at   timestamptz,
  first_seen_at          timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    t.id                       as therapist_id,
    t.name                     as therapist_name,
    sa.id                      as salon_id,
    sa.name                    as salon_name,
    si.name                    as site_name,
    av.date                    as slot_date,
    av.start_time,
    av.last_state_change_at,
    av.first_seen_at
  from public.availability av
  join public.therapists t  on t.id  = av.therapist_id
  join public.salons     sa on sa.id = t.salon_id
  join public.sites      si on si.id = sa.site_id
  where av.is_available = true
    and av.date < (now() at time zone 'Asia/Tokyo')::date
    and t.deleted_at  is null
    and sa.deleted_at is null
  order by av.date asc, sa.name asc, t.name asc, av.start_time asc
  limit greatest(p_limit, 1);
$$;


-- ============================================================
-- grant: service_role のみ。anon / authenticated には公開しない。
-- ============================================================
revoke all on function public.stats_availability_events_feed(int, int, text[], uuid, uuid, uuid) from public;
revoke all on function public.stats_stale_open_slots_overview()                                  from public;
revoke all on function public.stats_stale_open_slots_by_salon(int)                               from public;
revoke all on function public.stats_stale_open_slots_list(int)                                   from public;

grant execute on function public.stats_availability_events_feed(int, int, text[], uuid, uuid, uuid) to service_role;
grant execute on function public.stats_stale_open_slots_overview()                                  to service_role;
grant execute on function public.stats_stale_open_slots_by_salon(int)                               to service_role;
grant execute on function public.stats_stale_open_slots_list(int)                                   to service_role;
