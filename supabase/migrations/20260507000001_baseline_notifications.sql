-- ============================================================
-- Migration: 20260507000001_baseline_notifications.sql
-- Description: 監視設定を追加した瞬間に既に空いていた枠が通知される問題を解消する。
--              「監視を始めた以降に発生した本物の状態変化」だけを通知対象にする。
--
--   - watch_settings.baseline_at:
--       監視を「いま開始した」とみなす起点時刻。INSERT 時 default now()。
--       is_active を OFF→ON や therapist_id を切り替えたタイミングで
--       Web 側から now() に更新し、起点をリセットする。
--
--   - availability.last_state_change_at:
--       is_available が実際に切り替わった時刻。upsert_availability の中で
--       値が変化したスクレイピングのときだけ now() に更新する。
--       INSERT 時は default で now()。
--
--   - enqueue_notifications:
--       通知対象の絞り込みに次の 2 条件を追加（strict 比較）。
--         * c.last_state_change_at > w.baseline_at
--             状態変化が起点より「後」（同瞬間は含めない）
--         * c.first_seen_at        < w.baseline_at
--             起点より「前」から観測していた枠だけ
--       これで「監視追加と同瞬間に既に空いていた枠」も
--       「監視追加後に新規検出された枠（過去状態が不明）」も通知されない。
-- ============================================================


-- ============================================================
-- watch_settings.baseline_at
-- 既存行は created_at をベースラインとして扱い、現状の挙動と整合させる。
-- ============================================================
alter table watch_settings
  add column if not exists baseline_at timestamptz;

update watch_settings
   set baseline_at = created_at
 where baseline_at is null;

alter table watch_settings
  alter column baseline_at set default now(),
  alter column baseline_at set not null;


-- ============================================================
-- availability.last_state_change_at
-- 既存行は updated_at（最後にスクレイピングされた時刻）で一旦埋める。
-- 既存 watch_settings の baseline_at は created_at に合わせており、
-- 既存 availability の last_state_change_at は基本それより後の値を取るため、
-- マイグレーション直後の最初のスクレイピングで誤通知が出ないよう、
-- 「first_seen_at < baseline_at」条件と組み合わせて抑止する設計にしている。
-- ============================================================
alter table availability
  add column if not exists last_state_change_at timestamptz;

update availability
   set last_state_change_at = updated_at
 where last_state_change_at is null;

alter table availability
  alter column last_state_change_at set default now(),
  alter column last_state_change_at set not null;


-- ============================================================
-- upsert_availability
-- last_state_change_at を「is_available が実際に変化した瞬間」だけ更新する。
-- INSERT 時は default で now()、UPDATE 時は値が変わったときだけ now() に上書き。
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
        last_state_change_at  = case
          when availability.is_available is distinct from excluded.is_available
            then now()
          else availability.last_state_change_at
        end,
        updated_at            = now();
end;
$$ language plpgsql;


-- ============================================================
-- enqueue_notifications
-- baseline_at + last_state_change_at + first_seen_at を組み合わせ、
-- 「監視を始めて以降に発生した本物の状態変化」だけを通知対象にする。
-- candidates の定義は従来どおり（false→true 遷移 もしくは 初回検出かつ空き）だが、
-- targets 側の JOIN 条件で baseline によって厳密に絞り込む。
-- ============================================================
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
     -- 監視開始（baseline_at）より「後」に発生した状態変化のみ通知する。
     -- 等号を含めない strict 比較にすることで、監視追加と同瞬間に検出された枠は黙らせる。
     and c.last_state_change_at  > w.baseline_at
     -- 監視開始より「前」から観測していた枠のみ対象にする。
     -- baseline 以後に新規発見された枠は過去状態が不明なため通知しない。
     and c.first_seen_at         < w.baseline_at
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
