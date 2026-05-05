-- ============================================================
-- Migration: 20260426000001_rls.sql
-- Description: Row Level Security の設定
-- ============================================================


-- ============================================================
-- RLS 有効化
-- ============================================================
alter table users               enable row level security;
alter table therapists          enable row level security;
alter table watch_settings      enable row level security;
alter table watch_schedules     enable row level security;
alter table availability        enable row level security;
alter table notification_logs   enable row level security;


-- ============================================================
-- users ポリシー
-- ============================================================
create policy "users_select" on users for select using (id = auth.uid());
create policy "users_update" on users for update using (id = auth.uid());


-- ============================================================
-- therapists ポリシー
-- 誰でも読み取り可、書き込みはservice_roleのみ（スクレイパー）
-- ============================================================
create policy "therapists_select" on therapists for select using (true);


-- ============================================================
-- watch_settings ポリシー
-- ============================================================
create policy "watch_settings_select"
  on watch_settings for select
  using (user_id = auth.uid());

create policy "watch_settings_insert"
  on watch_settings for insert
  with check (user_id = auth.uid());

create policy "watch_settings_update"
  on watch_settings for update
  using (user_id = auth.uid());

create policy "watch_settings_delete"
  on watch_settings for delete
  using (user_id = auth.uid());


-- ============================================================
-- watch_schedules ポリシー
-- 自分のwatch_settingsに紐づくもののみ読み書き可
-- ============================================================
create policy "watch_schedules_select"
  on watch_schedules for select
  using (
    exists (
      select 1 from watch_settings
      where watch_settings.id = watch_schedules.watch_setting_id
        and watch_settings.user_id = auth.uid()
    )
  );

create policy "watch_schedules_insert"
  on watch_schedules for insert
  with check (
    exists (
      select 1 from watch_settings
      where watch_settings.id = watch_schedules.watch_setting_id
        and watch_settings.user_id = auth.uid()
    )
  );

create policy "watch_schedules_update"
  on watch_schedules for update
  using (
    exists (
      select 1 from watch_settings
      where watch_settings.id = watch_schedules.watch_setting_id
        and watch_settings.user_id = auth.uid()
    )
  );

create policy "watch_schedules_delete"
  on watch_schedules for delete
  using (
    exists (
      select 1 from watch_settings
      where watch_settings.id = watch_schedules.watch_setting_id
        and watch_settings.user_id = auth.uid()
    )
  );


-- ============================================================
-- availability ポリシー
-- 誰でも読み取り可、書き込みはservice_roleのみ（スクレイパー）
-- ============================================================
create policy "availability_select" on availability for select using (true);


-- ============================================================
-- notification_logs ポリシー
-- 自分のwatch_settingsに紐づくもののみ読み取り可
-- 書き込みはservice_roleのみ（スクレイパー）
-- ============================================================
create policy "notification_logs_select"
  on notification_logs for select
  using (
    exists (
      select 1 from watch_settings
      where watch_settings.id = notification_logs.watch_setting_id
        and watch_settings.user_id = auth.uid()
    )
  );