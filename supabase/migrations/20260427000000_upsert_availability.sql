-- ============================================================
-- Migration: 20260427000000_upsert_availability.sql
-- Description: Stage 3（空き枠クロール）用RPCを追加
--   - upsert_availability: 既存is_availableをprevious_is_availableへ移してupsert
--   - enqueue_notifications: 差分検知 + watch_schedules + 重複防止で
--     notification_logs にレコードを積む
-- ============================================================


-- ============================================================
-- upsert_availability
-- jsonb配列 [{ date, start_time, is_available }] を一括upsertする
-- ============================================================
create or replace function upsert_availability(
  p_therapist_id uuid,
  p_rows jsonb
) returns void as $$
begin
  insert into availability (
    therapist_id, date, start_time, is_available, previous_is_available
  )
  select
    p_therapist_id,
    (r->>'date')::date,
    (r->>'start_time')::time,
    (r->>'is_available')::boolean,
    null
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (therapist_id, date, start_time) do update
    set previous_is_available = availability.is_available,
        is_available          = excluded.is_available,
        updated_at            = now();
end;
$$ language plpgsql;


-- ============================================================
-- enqueue_notifications
-- 通知対象を検知し notification_logs にINSERTする
-- 差分パターン:
--   1. previous_is_available = false AND is_available = true
--   2. first_seen_at = updated_at AND is_available = true（新規枠かつ空き）
-- watch_schedules があれば日付・時間帯でフィルタ。重複は (watch_setting_id,
-- therapist_id, date, start_time, channel) で防止する。
-- 戻り値: 追加された通知件数
-- ============================================================
create or replace function enqueue_notifications()
returns integer as $$
declare
  inserted_count integer;
begin
  with
  -- 通知対象 availability を絞り込み
  candidates as (
    select a.therapist_id, a.date, a.start_time
    from availability a
    where a.is_available = true
      and (
        a.previous_is_available is false
        or a.first_seen_at = a.updated_at
      )
  ),
  -- watch_settings × channel に展開
  watches as (
    select
      ws.id           as watch_setting_id,
      ws.therapist_id,
      ch.channel
    from watch_settings ws
    cross join lateral (
      values
        ('line',  ws.notify_line),
        ('email', ws.notify_email)
    ) as ch(channel, enabled)
    where ws.is_active = true
      and ws.deleted_at is null
      and ch.enabled is true
  ),
  -- 通知対象を最終確定
  targets as (
    select
      w.watch_setting_id,
      c.therapist_id,
      c.date,
      c.start_time,
      w.channel
    from candidates c
    join watches w on w.therapist_id = c.therapist_id
    where (
      not exists (
        select 1 from watch_schedules wsc
        where wsc.watch_setting_id = w.watch_setting_id
          and wsc.deleted_at is null
      )
      or exists (
        select 1 from watch_schedules wsc
        where wsc.watch_setting_id = w.watch_setting_id
          and wsc.deleted_at is null
          and (wsc.target_date is null or wsc.target_date = c.date)
          and (wsc.time_from   is null or wsc.time_from   <= c.start_time)
          and (wsc.time_to     is null or wsc.time_to     >= c.start_time)
      )
    )
    and not exists (
      select 1 from notification_logs nl
      where nl.watch_setting_id = w.watch_setting_id
        and nl.therapist_id     = c.therapist_id
        and nl.date             = c.date
        and nl.start_time       = c.start_time
        and nl.channel          = w.channel
    )
  ),
  ins as (
    insert into notification_logs (
      watch_setting_id, therapist_id, date, start_time, channel
    )
    select watch_setting_id, therapist_id, date, start_time, channel
    from targets
    returning 1
  )
  select count(*) into inserted_count from ins;

  return coalesce(inserted_count, 0);
end;
$$ language plpgsql;
