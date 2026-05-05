-- ============================================================
-- Migration: 20260505000000_notification_status.sql
-- Description: notification_logs を「キュー兼ログ」として運用するため
--              送信状態カラムと重複防止 unique 制約・取得用インデックスを追加。
--              enqueue_notifications RPC は status カラムの default を
--              利用するため SQL 本体の変更は不要。
-- ============================================================


-- ============================================================
-- 状態カラムの追加
--   pending  : enqueue 直後（送信待ち）
--   sending  : 取り出し中（重複送信防止のロック相当）
--   sent     : 送信成功
--   failed   : 送信失敗（MVP では再試行しない）
-- ============================================================
alter table notification_logs
  add column if not exists status            text        not null default 'pending',
  add column if not exists sent_at           timestamptz,
  add column if not exists error             text,
  add column if not exists attempt_count     integer     not null default 0,
  add column if not exists last_attempted_at timestamptz;


-- ============================================================
-- ステータス値域チェック
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_logs_status_check'
  ) then
    alter table notification_logs
      add constraint notification_logs_status_check
      check (status in ('pending', 'sending', 'sent', 'failed'));
  end if;
end $$;


-- ============================================================
-- 重複 enqueue を構造的に防ぐ unique 制約
-- enqueue_notifications RPC でも not exists で重複防止しているが、
-- 並行実行や手動 INSERT でも壊れないようにここでも保証する。
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_logs_unique_target'
  ) then
    alter table notification_logs
      add constraint notification_logs_unique_target
      unique (watch_setting_id, therapist_id, date, start_time, channel);
  end if;
end $$;


-- ============================================================
-- ディスパッチャの取り出しを高速化するインデックス
-- pending / sending のみが対象なので部分インデックスにする
-- ============================================================
create index if not exists idx_notification_logs_status_created
  on notification_logs(status, created_at)
  where status in ('pending', 'sending');
