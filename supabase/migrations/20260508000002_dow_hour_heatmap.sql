-- ============================================================
-- Migration: 20260508000002_dow_hour_heatmap.sql
-- Description: get_therapist_stats を改修し、時間帯ヒートマップと
--              曜日ヒートマップを 1 つの 2 次元ヒートマップに統合する。
--
--   変更点:
--     旧: hourly_heatmap (json[≤24])  時間帯別の出現回数
--         dow_heatmap    (json[≤7])   曜日別の出現回数
--     新: dow_hour_heatmap (json[≤168])
--         { dow: 0-6, hour: 0-23, count: int } の配列。
--         出現がない (dow, hour) ペアは含めない（UI 側で 0 埋め）。
-- ============================================================


create or replace function get_therapist_stats(
  p_therapist_id uuid,
  p_window_days  int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today_jst    date := (now() at time zone 'Asia/Tokyo')::date;
  v_window_start timestamptz := now() - make_interval(days => p_window_days);
  v_next_shift   date;
  v_shift_days   int;
  v_opening_cnt  int;
  v_kill_seconds numeric;
  v_dow_hour     jsonb;
  v_watchers     int;
begin
  -- 次の出勤日（JST 基準で今日以降の最小日付）
  select min(date) into v_next_shift
  from availability
  where therapist_id = p_therapist_id
    and date >= v_today_jst;

  -- 直近 N 日のシフト日数（distinct date）
  select count(distinct date)::int into v_shift_days
  from availability
  where therapist_id = p_therapist_id
    and date >= v_today_jst - p_window_days
    and date <= v_today_jst;

  -- 直近 N 日の空き出現回数（opened / discovered_open）
  select count(*)::int into v_opening_cnt
  from availability_events
  where therapist_id = p_therapist_id
    and event_type in ('opened', 'discovered_open')
    and occurred_at >= v_window_start;

  -- 瞬殺時間中央値: スロット単位で「open 系イベント → 直後の close 系イベント」をペアリング。
  -- close 側が直近 N 日以内に発生したペアのみを母集団とする。
  with paired as (
    select
      event_type,
      occurred_at,
      lead(occurred_at) over (
        partition by date, start_time
        order by occurred_at
      ) as next_at,
      lead(event_type) over (
        partition by date, start_time
        order by occurred_at
      ) as next_type
    from availability_events
    where therapist_id = p_therapist_id
  )
  select
    percentile_cont(0.5) within group (
      order by extract(epoch from (next_at - occurred_at))
    )
  into v_kill_seconds
  from paired
  where event_type in ('opened', 'discovered_open')
    and next_type in ('closed', 'discovered_closed')
    and next_at >= v_window_start;

  -- 曜日 × 時間帯ヒートマップ（出現がない (dow, hour) ペアは配列に含めない。UI 側で 0 埋め）
  -- dow: 0=日 .. 6=土（postgres extract(dow) と一致）
  -- hour: 0..23
  with dow_hour as (
    select
      extract(dow  from date      )::int as dow,
      extract(hour from start_time)::int as hour,
      count(*)::int as count
    from availability_events
    where therapist_id = p_therapist_id
      and event_type in ('opened', 'discovered_open')
      and occurred_at >= v_window_start
    group by 1, 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('dow', dow, 'hour', hour, 'count', count)
      order by dow, hour
    ),
    '[]'::jsonb
  )
  into v_dow_hour
  from dow_hour;

  -- 競争率（同セラピストを監視中のアクティブユーザ数）
  select count(distinct user_id)::int into v_watchers
  from watch_settings
  where therapist_id = p_therapist_id
    and is_active = true
    and deleted_at is null;

  return jsonb_build_object(
    'next_shift_date',      v_next_shift,
    'recent_shift_days',    coalesce(v_shift_days, 0),
    'recent_opening_count', coalesce(v_opening_cnt, 0),
    'median_kill_seconds', case
      when v_kill_seconds is null then null
      else round(v_kill_seconds)::int
    end,
    'dow_hour_heatmap',     v_dow_hour,
    'watcher_count',        coalesce(v_watchers, 0),
    'window_days',          p_window_days
  );
end;
$$;


grant execute on function get_therapist_stats(uuid, int)
  to anon, authenticated, service_role;
