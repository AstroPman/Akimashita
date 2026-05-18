-- ============================================================
-- Migration: 20260518000001_salons_research_enabled.sql
-- Description:
--   特定サロンを「ユーザ向け監視 (watch_settings) とは別に、
--   人気指標計測のためにサロン丸ごと availability を取り続けたい」要件のため、
--   salons.research_enabled フラグを追加する。
--
--   Stage 3 (availability) は watch_settings 配下に加えて
--   research_enabled = true なサロン配下のセラピストも対象に含める。
--
--   通知については enqueue_notifications() が watch_settings を JOIN する
--   設計なので、research 由来のセラピストは watch_settings 行を持たない限り
--   通知対象にならない (副作用が出ない)。
-- ============================================================


-- ============================================================
-- salons.research_enabled
-- 既存行は false (= 通常運用) のままにする。
-- 研究対象に追加したいときに service_role から true に切り替える運用。
-- ============================================================
alter table salons
  add column if not exists research_enabled boolean not null default false;


-- ============================================================
-- 部分インデックス
-- Stage 3 のクエリは research_enabled = true の少数行だけを引きたいので、
-- 部分インデックスで十分。salons 全体に通常 index を張る必要はない。
-- ============================================================
create index if not exists idx_salons_research_enabled
  on salons (id)
  where research_enabled = true;
