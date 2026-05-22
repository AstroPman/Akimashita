-- ============================================================
-- Migration: 20260522000002_salons_homepage_url.sql
-- Description:
--   salons にサロン公式サイトのトップ URL を保持する homepage_url を追加する。
--   既存の salons.url は「予約ページURL」(= CSV の booking_url) のまま据え置き。
--
--   homepage_url は external_salons.homepage_url と対称的に扱い、後続の
--   20260522000004 で link_salons_to_external() に「公式サイト URL 一致」経路を
--   OR で足す際の照合キーとして使う。
--
--   注意:
--     unique 制約は付けない。1 つの公式サイトが複数予約サイト (caskan / grow /
--     edc / estama) を併用するケースがあり、(site_id, shop_id) で別 salons 行
--     として並ぶため homepage_url は重複してよい。
-- ============================================================

alter table salons
  add column homepage_url text;

-- external_salons(homepage_url) と対称の partial index。
-- 後続のリンク照合 (salons.homepage_url = external_salons.homepage_url) を支える。
create index idx_salons_homepage_url
  on salons(homepage_url)
  where homepage_url is not null;
