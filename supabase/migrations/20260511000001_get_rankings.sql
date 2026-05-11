-- ============================================================
-- Migration: 20260511000001_get_rankings.sql
-- Description: ランキングページ向けに、セラピスト横断の 2 種類の
--              ランキング集計 RPC を追加する。
--
--   - get_kill_time_ranking:
--       直近 N 日における「空き出現 → 再満枠」までの中央値（瞬殺時間）
--       が短い順に Top N セラピストを返す。
--
--   - get_watcher_count_ranking:
--       現時点でアクティブな監視設定（watch_settings）の人数が多い順に
--       Top N セラピストを返す。
--
--   いずれも therapists.deleted_at is null の在籍セラピストのみ対象。
--   watcher_count 算出のため watch_settings を読む必要があるので
--   security definer で実装し、集計値のみを露出する。
-- ============================================================


-- ============================================================
-- 瞬殺時間ランキング
-- ============================================================
create or replace function get_kill_time_ranking(
  p_limit        int default 20,
  p_window_days  int default 30,
  p_min_samples  int default 5
)
returns table (
  therapist_id         uuid,
  name                 text,
  image_url            text,
  profile_url          text,
  salon_id             uuid,
  salon_name           text,
  median_kill_seconds  int,
  sample_count         int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - make_interval(days => p_window_days);
begin
  return query
  with paired as (
    -- セラピスト × スロット単位で open 系イベントの直後イベントとペアリング
    select
      e.therapist_id,
      e.event_type,
      e.occurred_at,
      lead(e.occurred_at) over (
        partition by e.therapist_id, e.date, e.start_time
        order by e.occurred_at
      ) as next_at,
      lead(e.event_type) over (
        partition by e.therapist_id, e.date, e.start_time
        order by e.occurred_at
      ) as next_type
    from availability_events e
  ),
  kill_samples as (
    select
      p.therapist_id,
      extract(epoch from (p.next_at - p.occurred_at)) as kill_seconds
    from paired p
    where p.event_type in ('opened', 'discovered_open')
      and p.next_type in ('closed', 'discovered_closed')
      and p.next_at >= v_window_start
  ),
  aggregated as (
    select
      ks.therapist_id,
      percentile_cont(0.5) within group (order by ks.kill_seconds) as median_seconds,
      count(*)::int as sample_count
    from kill_samples ks
    group by ks.therapist_id
    having count(*) >= p_min_samples
  )
  select
    t.id                        as therapist_id,
    t.name                      as name,
    t.image_url                 as image_url,
    t.profile_url               as profile_url,
    s.id                        as salon_id,
    s.name                      as salon_name,
    round(a.median_seconds)::int as median_kill_seconds,
    a.sample_count              as sample_count
  from aggregated a
  join therapists t on t.id = a.therapist_id
  join salons     s on s.id = t.salon_id
  where t.deleted_at is null
    and s.deleted_at is null
  order by a.median_seconds asc, a.sample_count desc, t.name asc
  limit p_limit;
end;
$$;


-- ============================================================
-- 監視者数ランキング
-- ============================================================
create or replace function get_watcher_count_ranking(
  p_limit int default 20
)
returns table (
  therapist_id   uuid,
  name           text,
  image_url      text,
  profile_url    text,
  salon_id       uuid,
  salon_name     text,
  watcher_count  int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with aggregated as (
    select
      ws.therapist_id,
      count(distinct ws.user_id)::int as watcher_count
    from watch_settings ws
    where ws.is_active = true
      and ws.deleted_at is null
    group by ws.therapist_id
    having count(distinct ws.user_id) > 0
  )
  select
    t.id          as therapist_id,
    t.name        as name,
    t.image_url   as image_url,
    t.profile_url as profile_url,
    s.id          as salon_id,
    s.name        as salon_name,
    a.watcher_count
  from aggregated a
  join therapists t on t.id = a.therapist_id
  join salons     s on s.id = t.salon_id
  where t.deleted_at is null
    and s.deleted_at is null
  order by a.watcher_count desc, t.name asc
  limit p_limit;
end;
$$;


grant execute on function get_kill_time_ranking(int, int, int)
  to anon, authenticated, service_role;

grant execute on function get_watcher_count_ranking(int)
  to anon, authenticated, service_role;
