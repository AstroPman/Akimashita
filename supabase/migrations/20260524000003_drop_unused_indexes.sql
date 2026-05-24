-- ============================================================
-- Migration: 20260524000003_drop_unused_indexes.sql
-- Description:
--   Supabase Performance Advisor で `unused_index` 警告が出ている
--   インデックス 4 本を削除し、外部キーに不足していた索引を 1 本追加する。
--
--   検出根拠:
--     pg_stat_user_indexes.idx_scan = 0 (本番、稼働 17 日時点)
--     advisor (https://supabase.com/docs/guides/database/database-linter
--              ?lint=0005_unused_index)
--
--   削除対象:
--     - idx_users_plan_tier                         (16 kB)
--     - idx_external_therapists_therapist_url       (20 MB) ★
--     - idx_external_therapist_shifts_external_therapist_date (16 kB)
--     - idx_salons_homepage_url                     (80 kB)
--
--     ★ external_therapists の書き込み (Stage 1 details / link)
--       で毎回更新されるため、20 MB の partial index を維持するコストが
--       書き込み時の Disk IO に直結していた。削除で WAL も縮む。
--
--     idx_external_therapists_therapist_url は当初 Stage 5 official_shifts
--     起動経路向けに張ったが、実際には external_therapists.id 経由の
--     PK lookup で済んでおり partial index は使われない。
--     (20260524000001_scraper_target_rpcs.sql の
--      get_official_shifts_targets でも同様。)
--
--   追加対象:
--     - watch_schedules(watch_setting_id)
--       advisor (unindexed_foreign_keys) で警告。
--       FK の cascade / 参照整合チェックが seq scan に落ちないようにする。
--       現状 watch_schedules は 0 行だが、ユーザ増加時の保険として張る。
-- ============================================================

drop index if exists public.idx_users_plan_tier;
drop index if exists public.idx_external_therapists_therapist_url;
drop index if exists public.idx_external_therapist_shifts_external_therapist_date;
drop index if exists public.idx_salons_homepage_url;

create index if not exists idx_watch_schedules_watch_setting_id
  on public.watch_schedules (watch_setting_id);
