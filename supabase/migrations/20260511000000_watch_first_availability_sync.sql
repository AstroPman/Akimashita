-- ============================================================
-- Migration: 20260511000000_watch_first_availability_sync.sql
-- Description:
--   監視追加直後の「初回 availability 取得」では通知しないまま、
--   その後サイトに新規公開された時間帯（availability 新規行）の空きは通知する。
--
--   - watch_settings.first_availability_synced_at:
--       その監視のセラピストについて、スクレイパーが初めて（成功して）
--       availability を同期し終えた時刻。NULL の間は「初回同期前」。
--       既存行は baseline_at で埋め、従来の baseline ロジックと整合させる。
--
--   - enqueue_notifications の JOIN 条件:
--       last_state_change_at > baseline_at は維持。
--       次のどちらかを満たす枠を対象にする:
--         A) first_seen_at < baseline_at … baseline 前から観測していた枠が、
--            baseline 後に空きへ変化した（従来どおり）
--         B) first_availability_synced_at IS NOT NULL
--            AND first_seen_at > first_availability_synced_at …
--            初回同期が済んだあとに新規検出された枠（新シフト列など）
-- ============================================================

alter table watch_settings
  add column if not exists first_availability_synced_at timestamptz;

update watch_settings
   set first_availability_synced_at = baseline_at
 where first_availability_synced_at is null;

create or replace function enqueue_notifications()
returns integer as $$
declare
  inserted_count integer;
begin
  with
  candidates as (
    select
      a.therapist_id,
      a.date,
      a.start_time,
      a.first_seen_at,
      a.last_state_change_at
    from availability a
    where a.is_available = true
      and (
        a.previous_is_available is false
        or a.first_seen_at = a.updated_at
      )
  ),
  watches as (
    select
      ws.id           as watch_setting_id,
      ws.therapist_id,
      ws.baseline_at,
      ws.first_availability_synced_at,
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
      and public.is_subscription_active(ws.user_id)
  ),
  targets as (
    select
      w.watch_setting_id,
      c.therapist_id,
      c.date,
      c.start_time,
      w.channel
    from candidates c
    join watches w
      on w.therapist_id           = c.therapist_id
     and c.last_state_change_at  > w.baseline_at
     and (
       c.first_seen_at < w.baseline_at
       or (
         w.first_availability_synced_at is not null
         and c.first_seen_at > w.first_availability_synced_at
       )
     )
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
