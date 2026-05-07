-- ============================================================
-- Migration: 20260507000000_notifications_inbox.sql
-- Description: 通知インボックス機能の追加。
--              - notification_emails: 送信されたメール本文のスナップショット。
--                同一バッチ（同一ユーザに対する 1 通のメール）を 1 行で表現する。
--                /notifications 画面ではこのテーブルを 1 メール = 1 カードで表示する。
--              - notification_logs.email_id: notification_emails への FK。
--                バッチを構成する各 notification_logs 行は同じ email_id を持つ。
--              - announcements: 運営からの全ユーザ向けお知らせ。
--                Supabase Studio から直接 INSERT する運用を想定。
--              - announcement_reads: ユーザごとの既読管理ジャンクション。
-- ============================================================


-- ============================================================
-- notification_emails
-- ユーザに送信したメール 1 通分の subject / 本文を保存する。
-- 既読管理のため read_at を持つ。
-- ============================================================
create table notification_emails (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  subject     text not null,
  body_text   text not null,
  body_html   text,
  sent_at     timestamptz not null,
  read_at     timestamptz,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

create index idx_notification_emails_user_sent_at
  on notification_emails(user_id, sent_at desc);

create trigger trg_notification_emails_updated_at
  before update on notification_emails
  for each row execute function update_updated_at();


-- ============================================================
-- notification_logs に email_id を追加
-- 既存データは null のまま（インボックス画面の表示対象外）
-- ============================================================
alter table notification_logs
  add column if not exists email_id uuid references notification_emails(id) on delete set null;

create index if not exists idx_notification_logs_email_id
  on notification_logs(email_id);


-- ============================================================
-- announcements
-- サービス運営からのお知らせ（全ユーザ向け）。
-- 管理 UI は提供しないため、Supabase Studio / SQL から直接 INSERT する。
-- published_at が未来のものは表示されない。
-- ============================================================
create table announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body_text     text not null,
  body_html     text,
  published_at  timestamptz default now() not null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  deleted_at    timestamptz
);

create index idx_announcements_published_at
  on announcements(published_at desc)
  where deleted_at is null;

create trigger trg_announcements_updated_at
  before update on announcements
  for each row execute function update_updated_at();


-- ============================================================
-- announcement_reads
-- 各ユーザがどのお知らせを既読にしたかを記録する。
-- お知らせ自体は全ユーザ共通のため、既読状態だけユーザ単位で持つ。
-- ============================================================
create table announcement_reads (
  announcement_id  uuid not null references announcements(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  read_at          timestamptz default now() not null,
  primary key (announcement_id, user_id)
);

create index idx_announcement_reads_user
  on announcement_reads(user_id);


-- ============================================================
-- RLS 有効化
-- ============================================================
alter table notification_emails  enable row level security;
alter table announcements        enable row level security;
alter table announcement_reads   enable row level security;


-- ============================================================
-- notification_emails ポリシー
-- 自分宛のメールのみ読める。read_at の更新も自分宛のみ可。
-- INSERT / DELETE はサービスロール（scraper）のみ。
-- ============================================================
create policy "notification_emails_select"
  on notification_emails for select
  using (user_id = auth.uid());

create policy "notification_emails_update"
  on notification_emails for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ============================================================
-- announcements ポリシー
-- 認証ユーザは公開済み（published_at <= now()）かつ未削除のものを SELECT 可。
-- 書き込みポリシーなし（service_role のみ）。
-- ============================================================
create policy "announcements_select_published"
  on announcements for select
  to authenticated
  using (published_at <= now() and deleted_at is null);


-- ============================================================
-- announcement_reads ポリシー
-- 自分の既読状態のみ読み書き可。
-- ============================================================
create policy "announcement_reads_select"
  on announcement_reads for select
  using (user_id = auth.uid());

create policy "announcement_reads_insert"
  on announcement_reads for insert
  with check (user_id = auth.uid());

create policy "announcement_reads_delete"
  on announcement_reads for delete
  using (user_id = auth.uid());
