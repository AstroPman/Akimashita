-- ============================================================
-- Migration: 20260514000000_plan_tier_introduction.sql
-- Description: 課金プランを 3 段階 (free / standard / premium) へ刷新する。
--
--   - plan_tier / billing_cycle enum を新設。
--   - users.plan_tier を追加し、アプリ全体のプラン判定はこの列に一元化。
--   - subscriptions.plan(text) を tier(plan_tier) と cycle(billing_cycle)
--     に分解。free ユーザは subscriptions 行を持たない設計。
--   - notification_logs.send_after を追加。enqueue_notifications RPC が
--     プランごとの送信予定時刻を設定し、scraper はこの時刻以降の行のみ
--     送信する（即時 / 5 分 / 10 分の遅延制御）。
--   - is_subscription_active は users.plan_tier ベースに書き換える
--     （tier in ('standard','premium') を「有料」と定義）。
--   - enqueue_notifications は無料ユーザも対象に含めるよう変更し、
--     plan_tier に応じた send_after を計算する。
-- ============================================================


-- ============================================================
-- enum 型
-- ============================================================
create type plan_tier as enum ('free', 'standard', 'premium');
create type billing_cycle as enum ('monthly', 'yearly');


-- ============================================================
-- users.plan_tier
-- 既定は free。Webhook で課金状態が変わったときに standard/premium に
-- 書き換えられる。アプリ層は基本的にこの列だけで権限判定する。
-- ============================================================
alter table users
  add column plan_tier plan_tier not null default 'free';

create index idx_users_plan_tier on users(plan_tier);


-- ============================================================
-- subscriptions の plan(text) を tier(plan_tier) と cycle(billing_cycle)
-- に分解。既存ユーザはいない前提のため、column 置換で問題ない。
-- ============================================================
alter table subscriptions
  drop column if exists plan;

alter table subscriptions
  add column tier  plan_tier     not null default 'standard',
  add column cycle billing_cycle not null default 'monthly';

-- default は移行ガード用。アプリ側の sync では必ず明示的に値を入れるので
-- 不要だが、column 追加の便宜上残しておく。
alter table subscriptions
  alter column tier  drop default,
  alter column cycle drop default;


-- ============================================================
-- notification_logs.send_after
-- enqueue 時点でプランに応じた送信予定時刻を確定させる。
-- scraper の dispatcher は send_after <= now() の行のみ取得する。
-- ============================================================
alter table notification_logs
  add column send_after timestamptz not null default now();

-- 既存の status インデックスを send_after を含めた形に張り替える
drop index if exists idx_notification_logs_status_created;

create index idx_notification_logs_status_send_after
  on notification_logs(status, send_after, created_at)
  where status in ('pending', 'sending');


-- ============================================================
-- is_subscription_active
-- 「有料プラン契約中か」を返す。aaplan_tier ベースの判定に置き換える。
--   - free      : false
--   - standard  : true
--   - premium   : true
-- ============================================================
create or replace function public.is_subscription_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select plan_tier in ('standard', 'premium')
      from users
      where id = target_user_id
        and deleted_at is null
    ),
    false
  );
$$;

grant execute on function public.is_subscription_active(uuid)
  to authenticated, service_role;


-- ============================================================
-- enqueue_notifications
--   - 無料ユーザも通知対象に含める（プランによって send_after が遅れる）
--   - plan_tier に応じた送信予定時刻を設定:
--       premium  : now()
--       standard : now() + 5 minutes
--       free     : now() + 10 minutes
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
      ws.first_availability_synced_at,
      u.plan_tier,
      ch.channel
    from watch_settings ws
    join users u on u.id = ws.user_id
    cross join lateral (
      values
        ('line',  ws.notify_line),
        ('email', ws.notify_email)
    ) as ch(channel, enabled)
    where ws.is_active = true
      and ws.deleted_at is null
      and ch.enabled is true
      and u.deleted_at is null
  ),
  targets as (
    select
      w.watch_setting_id,
      c.therapist_id,
      c.date,
      c.start_time,
      w.channel,
      case w.plan_tier
        when 'premium'  then now()
        when 'standard' then now() + interval '5 minutes'
        when 'free'     then now() + interval '10 minutes'
      end as send_after
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
      watch_setting_id, therapist_id, date, start_time, channel, send_after
    )
    select watch_setting_id, therapist_id, date, start_time, channel, send_after
    from targets
    returning 1
  )
  select count(*) into inserted_count from ins;

  return coalesce(inserted_count, 0);
end;
$$ language plpgsql;
