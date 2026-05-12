-- ============================================================
-- Migration: 20260512000000_next_available_slot.sql
-- Description:
--   /watches リストおよび /watches/[id] 詳細画面で「直近の空き枠
--   （現在 JST 時刻以降で最も早い is_available=true のスロット）」
--   を表示するための関数群。
--
--   - get_therapist_stats: 既存関数を CREATE OR REPLACE し、戻り値
--     jsonb に next_available_slot キーを追加する。
--   - get_next_available_slots: リスト一括取得用 RPC。
--     therapist_ids 配列に対し、各セラピストの最早空き枠を
--     { "<therapist_id>": { "date": "...", "start_time": "..." } } 形式で返す。
--     空き枠なしのセラピストはキーごと省略する。
--
--   どちらも希望日時条件 (watch_schedules) は考慮しない。
-- ============================================================


-- ============================================================
-- get_therapist_stats: next_available_slot を追加
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
  v_now_jst      timestamp := (now() at time zone 'Asia/Tokyo');
  v_window_start timestamptz := now() - make_interval(days => p_window_days);
  v_next_shift   date;
  v_shift_days   int;
  v_opening_cnt  int;
  v_kill_seconds numeric;
  v_dow_hour     jsonb;
  v_watchers     int;
  v_next_slot    jsonb;
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

  -- 直近の空き枠（JST 現在時刻以降の最早 is_available=true スロット）
  select jsonb_build_object(
    'date',       to_char(date, 'YYYY-MM-DD'),
    'start_time', to_char(start_time, 'HH24:MI:SS')
  )
  into v_next_slot
  from availability
  where therapist_id = p_therapist_id
    and is_available = true
    and (date + start_time) > v_now_jst
  order by date asc, start_time asc
  limit 1;

  return jsonb_build_object(
    'next_shift_date',      v_next_shift,
    'recent_shift_days',    coalesce(v_shift_days, 0),
    'recent_opening_count', coalesce(v_opening_cnt, 0),
    'median_kill_seconds', case
      when v_kill_seconds is null then null
      else round(v_kill_seconds)::int
    end,
    'dow_hour_heatmap',      v_dow_hour,
    'watcher_count',         coalesce(v_watchers, 0),
    'window_days',           p_window_days,
    'next_available_slot',   v_next_slot
  );
end;
$$;


grant execute on function get_therapist_stats(uuid, int)
  to anon, authenticated, service_role;


-- ============================================================
-- get_next_available_slots
-- リスト画面で複数セラピストの直近空き枠を一括取得する RPC。
--
-- 戻り値: jsonb オブジェクト
--   { "<therapist_id>": { "date": "YYYY-MM-DD", "start_time": "HH:MM:SS" }, ... }
--   空き枠なしのセラピストはキーごと省略する。
-- ============================================================
create or replace function get_next_available_slots(
  p_therapist_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now_jst timestamp := (now() at time zone 'Asia/Tokyo');
  v_result  jsonb;
begin
  if p_therapist_ids is null or array_length(p_therapist_ids, 1) is null then
    return '{}'::jsonb;
  end if;

  with earliest as (
    select distinct on (therapist_id)
      therapist_id,
      date,
      start_time
    from availability
    where therapist_id = any(p_therapist_ids)
      and is_available = true
      and (date + start_time) > v_now_jst
    order by therapist_id, date asc, start_time asc
  )
  select coalesce(
    jsonb_object_agg(
      therapist_id::text,
      jsonb_build_object(
        'date',       to_char(date, 'YYYY-MM-DD'),
        'start_time', to_char(start_time, 'HH24:MI:SS')
      )
    ),
    '{}'::jsonb
  )
  into v_result
  from earliest;

  return v_result;
end;
$$;


grant execute on function get_next_available_slots(uuid[])
  to anon, authenticated, service_role;
