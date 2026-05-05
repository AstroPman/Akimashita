-- ============================================================
-- Migration: 20260426000000_init.sql
-- Description: 初期スキーマ作成
-- ============================================================


-- ============================================================
-- users
-- Supabase Auth (auth.users) と連携するユーザ追加情報テーブル
-- ============================================================
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  line_user_id  text,                           -- LINE通知用ユーザID
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  deleted_at    timestamptz                     -- 論理削除用
);


-- ============================================================
-- therapists
-- スクレイパーが自動登録・更新するセラピストマスタ
-- ============================================================
create table therapists (
  id            uuid primary key default gen_random_uuid(),
  site          text not null,                  -- 'caskan' | 'grow'
  shop_id       text not null,                  -- サイト内の店舗識別子
  therapist_id  text not null,                  -- サイト内のセラピスト識別子
  name          text not null,
  profile_url   text,
  image_url     text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  deleted_at    timestamptz,                    -- 論理削除用
  unique(site, shop_id, therapist_id)
);


-- ============================================================
-- watch_settings
-- ユーザが登録した「このセラピストを監視したい」という設定
-- ============================================================
create table watch_settings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  therapist_id  uuid not null references therapists(id) on delete cascade,
  is_active     boolean default true not null,  -- 監視の有効/無効
  notify_line   boolean default true not null,  -- LINE通知の有効/無効
  notify_email  boolean default true not null,  -- メール通知の有効/無効
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  deleted_at    timestamptz                     -- 論理削除用
);


-- ============================================================
-- watch_schedules
-- watch_settingsに対する日時絞り込み条件
-- レコードなし = 日時問わず空きが出たら通知
-- target_date のみ = 特定日に空きが出たら通知
-- target_date + time_from/time_to = 特定日時に空きが出たら通知
-- ============================================================
create table watch_schedules (
  id                uuid primary key default gen_random_uuid(),
  watch_setting_id  uuid not null references watch_settings(id) on delete cascade,
  target_date       date,                       -- 希望日（nullなら日付問わず）
  time_from         time,                       -- 希望開始時間（nullなら時間問わず）
  time_to           time,                       -- 希望終了時間（nullなら時間問わず）
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null,
  deleted_at        timestamptz                 -- 論理削除用
);


-- ============================================================
-- availability
-- スクレイパーが定期的にupsertする空き枠スナップショット
-- 差分検知用に previous_is_available と first_seen_at を保持
-- ============================================================
create table availability (
  id                       uuid primary key default gen_random_uuid(),
  therapist_id             uuid not null references therapists(id) on delete cascade,
  date                     date not null,
  start_time               time not null,
  is_available             boolean not null,
  previous_is_available    boolean,             -- 前回の空き状態（差分検知用）
  first_seen_at            timestamptz default now() not null, -- 初回検出日時
  created_at               timestamptz default now() not null,
  updated_at               timestamptz default now() not null,
  unique(therapist_id, date, start_time)
);


-- ============================================================
-- notification_logs
-- 通知履歴。同一枠への重複通知防止にも使用する
-- ============================================================
create table notification_logs (
  id                uuid primary key default gen_random_uuid(),
  watch_setting_id  uuid not null references watch_settings(id) on delete cascade,
  therapist_id      uuid not null references therapists(id) on delete cascade,
  date              date not null,
  start_time        time not null,
  channel           text not null,              -- 'line' | 'email'
  created_at        timestamptz default now() not null
  -- 通知ログは更新・論理削除しない性質のためupdated_at/deleted_atは不要
);


-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
  before update on users
  for each row execute function update_updated_at();

create trigger trg_therapists_updated_at
  before update on therapists
  for each row execute function update_updated_at();

create trigger trg_watch_settings_updated_at
  before update on watch_settings
  for each row execute function update_updated_at();

create trigger trg_watch_schedules_updated_at
  before update on watch_schedules
  for each row execute function update_updated_at();

create trigger trg_availability_updated_at
  before update on availability
  for each row execute function update_updated_at();


-- ============================================================
-- インデックス
-- ============================================================

-- スクレイパーがtherapist_idで空き枠を検索するケースが多い
create index idx_availability_therapist_date on availability(therapist_id, date);

-- 監視設定の検索（ユーザ別・セラピスト別）
create index idx_watch_settings_user_id on watch_settings(user_id);
create index idx_watch_settings_therapist_id on watch_settings(therapist_id);

-- 通知ログの重複チェック
create index idx_notification_logs_watch_setting_id on notification_logs(watch_setting_id);
create index idx_notification_logs_therapist_date on notification_logs(therapist_id, date, start_time);