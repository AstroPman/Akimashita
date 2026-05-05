-- ============================================================
-- Migration: 20260505000001_subscriptions_and_waitlist.sql
-- Description: Stripe ベースのサブスクリプション管理と、
--              限定サービスのための席数上限・ウェイトリストを追加。
--
--   - subscriptions: ユーザごとに 1 行（user_id PK）。
--                    Stripe の状態を Webhook 経由で同期する。
--   - waitlist:      満員時にメールアドレスを受け付けて空きが出たら案内する。
--   - try_reserve_seat / count_occupied_seats / is_subscription_active:
--                    席確保と課金状態判定を一元化する関数群。
-- ============================================================


-- ============================================================
-- subscriptions
-- ============================================================
create table subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  -- Stripe Customer / Subscription への参照。Checkout 開始前は null。
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  -- Stripe の subscription.status をそのまま保持する。
  --   incomplete           : Checkout 開始時に席を仮押さえした状態
  --   incomplete_expired   : Stripe 側でタイムアウト
  --   trialing             : トライアル期間中
  --   active               : 通常の課金中
  --   past_due             : 支払い失敗（猶予期間）
  --   canceled             : 解約済み（current_period_end まで利用可）
  --   unpaid               : 未払いで停止
  --   paused               : 一時停止
  status                 text not null,
  plan                   text,                -- 'monthly' | 'yearly'
  current_period_end     timestamptz,
  trial_end              timestamptz,
  cancel_at_period_end   boolean default false not null,
  created_at             timestamptz default now() not null,
  updated_at             timestamptz default now() not null
);

create index idx_subscriptions_status on subscriptions(status);

create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute function update_updated_at();


-- ============================================================
-- waitlist
-- 満員時のメール先行登録。匿名 INSERT を許可するためメール一意制約で重複を防ぐ。
-- ============================================================
create table waitlist (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  created_at    timestamptz default now() not null,
  invited_at    timestamptz,
  invite_token  text unique,
  invite_expires_at timestamptz,
  signed_up_at  timestamptz
);

create index idx_waitlist_invited on waitlist(invited_at) where invited_at is null;


-- ============================================================
-- RLS
-- ============================================================
alter table subscriptions enable row level security;
alter table waitlist      enable row level security;

-- subscriptions: 自分の行のみ読める。書き込みはサービスロール（webhook）からのみ。
create policy "subscriptions_select_self"
  on subscriptions for select
  using (user_id = auth.uid());

-- waitlist: 匿名でも自分の行を insert できる。select は自身のメール一致のみ
-- 認める運用にしてもよいが、MVP では select は service_role のみとする。
create policy "waitlist_insert_anyone"
  on waitlist for insert
  with check (true);


-- ============================================================
-- 席が「占有」とみなされる状態
--   incomplete : Checkout 開始済（仮押さえ）
--   trialing   : トライアル中
--   active     : 通常課金
--   past_due   : 支払い失敗の猶予期間
-- canceled でも current_period_end が未到達なら課金期間内なので占有扱いに含める。
-- 単純化のため canceled は status だけで判定し、課金期間内かどうかは
-- is_subscription_active 側で `current_period_end >= now()` を見る。
-- ============================================================
create or replace function public.count_occupied_seats()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from subscriptions
  where status in ('incomplete', 'trialing', 'active', 'past_due');
$$;


-- ============================================================
-- ユーザーが機能を利用できる状態かを判定するヘルパー
-- アプリのゲーティングと scraper の対象判定で同じ定義を使う。
--   trialing / active 常に true
--   past_due は支払い失敗中だが Stripe の猶予に合わせて true 扱い
--   canceled は current_period_end までは true（途中解約のフェアな扱い）
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
      select case
        when status in ('trialing', 'active', 'past_due') then true
        when status = 'canceled' and coalesce(current_period_end, now()) > now() then true
        else false
      end
      from subscriptions
      where user_id = target_user_id
    ),
    false
  );
$$;


-- ============================================================
-- 席を予約する RPC
--   - advisory lock で同時実行を直列化し、超過を防ぐ
--   - すでに席を持っている本人は常に成功（再 Checkout 想定）
--   - 席が空いていれば incomplete 行を upsert して仮押さえ
--   - 満員時は false を返す（呼び出し側で /waitlist に誘導）
-- ============================================================
create or replace function public.try_reserve_seat(
  target_user_id uuid,
  max_seats int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  occupied      int;
  current_status text;
begin
  -- 任意の固定キーで全体ロック。アプリ全体で同じ値を使う限り正しく直列化される。
  perform pg_advisory_xact_lock(91247001);

  select status into current_status
  from subscriptions
  where user_id = target_user_id;

  -- 既に席を持っている本人は素通し
  if current_status in ('incomplete', 'trialing', 'active', 'past_due') then
    return true;
  end if;
  if current_status = 'canceled' and exists (
    select 1 from subscriptions
    where user_id = target_user_id
      and coalesce(current_period_end, now()) > now()
  ) then
    return true;
  end if;

  select count_occupied_seats() into occupied;
  if occupied >= max_seats then
    return false;
  end if;

  insert into subscriptions (user_id, status)
  values (target_user_id, 'incomplete')
  on conflict (user_id) do update
    set status = 'incomplete',
        updated_at = now();

  return true;
end;
$$;


-- ============================================================
-- 仮押さえ（incomplete）のうち、Checkout が完了せず一定時間経過したものを
-- 解放する。Webhook で incomplete_expired を受け取れない場合の保険として、
-- cron や手動で呼ぶ。
-- ============================================================
create or replace function public.release_stale_incomplete_seats(
  older_than_minutes int default 60
)
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from subscriptions
    where status = 'incomplete'
      and stripe_subscription_id is null
      and updated_at < now() - make_interval(mins => older_than_minutes)
    returning user_id
  )
  select count(*)::int from deleted;
$$;


-- ============================================================
-- 関数の実行権限
--   try_reserve_seat / count_occupied_seats / is_subscription_active は
--   匿名・認証ユーザの両方から呼ばれうる。security definer なので
--   public スキーマのテーブルを参照する権限はサーバ側で確保される。
-- ============================================================
grant execute on function public.count_occupied_seats() to anon, authenticated;
grant execute on function public.is_subscription_active(uuid) to authenticated, service_role;
grant execute on function public.try_reserve_seat(uuid, int) to authenticated, service_role;
grant execute on function public.release_stale_incomplete_seats(int) to service_role;


-- ============================================================
-- enqueue_notifications をサブスク対象ユーザのみに絞る
-- 既存実装と完全に同じだが、watches CTE で users の subscription_active を見る。
-- 未加入ユーザの分は notification_logs を作らないことで scraper / dispatcher
-- 双方の負荷とノイズを抑える。
-- ============================================================
create or replace function enqueue_notifications()
returns integer as $$
declare
  inserted_count integer;
begin
  with
  candidates as (
    select a.therapist_id, a.date, a.start_time
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
      -- サブスクが有効なユーザのみ通知対象に含める
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
