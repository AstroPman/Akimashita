-- ============================================================
-- Migration: 20260508000001_get_therapist_stats.sql
-- Description: セラピスト詳細ページ向けの集計 RPC を新設。
--              1 回の呼び出しで以下を JSONB にまとめて返す。
--
--   キー一覧:
--     next_shift_date       date | null     次の出勤日（JST）
--     recent_shift_days     int             直近 N 日のシフト日数（distinct date）
--     recent_opening_count  int             直近 N 日の空き出現回数
--     median_kill_seconds   int  | null     直近 N 日に閉まったペアの瞬殺時間中央値
--     hourly_heatmap        json[24]        時間帯別の空き出現回数
--     dow_heatmap           json[7]         曜日（0=日 .. 6=土）別の空き出現回数
--     watcher_count         int             同セラピストを監視中のアクティブユーザ数
--     window_days           int             集計ウィンドウ（呼び出しパラメータの反映）
--
--   security definer:
--     watcher_count 算出のため watch_settings を参照する必要があり、
--     呼び出しユーザの auth.uid() に依存しない集計を返す。
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
  v_hourly       jsonb;
  v_dow          jsonb;
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

  -- 時間帯ヒートマップ（出現がない時間帯は配列に含めない。UI 側で 0 埋め）
  with hourly as (
    select
      extract(hour from start_time)::int as hour,
      count(*)::int as count
    from availability_events
    where therapist_id = p_therapist_id
      and event_type in ('opened', 'discovered_open')
      and occurred_at >= v_window_start
    group by 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('hour', hour, 'count', count) order by hour),
    '[]'::jsonb
  )
  into v_hourly
  from hourly;

  -- 曜日ヒートマップ（0=日曜）
  with dow as (
    select
      extract(dow from date)::int as dow,
      count(*)::int as count
    from availability_events
    where therapist_id = p_therapist_id
      and event_type in ('opened', 'discovered_open')
      and occurred_at >= v_window_start
    group by 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('dow', dow, 'count', count) order by dow),
    '[]'::jsonb
  )
  into v_dow
  from dow;

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
    'hourly_heatmap',       v_hourly,
    'dow_heatmap',          v_dow,
    'watcher_count',        coalesce(v_watchers, 0),
    'window_days',          p_window_days
  );
end;
$$;


grant execute on function get_therapist_stats(uuid, int)
  to anon, authenticated, service_role;
