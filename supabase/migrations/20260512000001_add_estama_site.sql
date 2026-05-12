-- ============================================================
-- Migration: 20260512000001_add_estama_site.sql
-- Description:
--   sites マスタに estama.jp (メンズエステ掲載ポータル) を追加する。
--   seed.sql の sites も同じ UUID で投入済み (ローカル/CI 用)。
--   サロン本体 (salons) は本マイグレーションでは投入せず、
--   staging/production では運用側で個別に追加する。
-- ============================================================

insert into sites (id, name, base_url, search_query) values
  ('00000000-0000-0000-0000-000000000004', 'estama', 'https://estama.jp', 'site:estama.jp')
on conflict (id) do nothing;
