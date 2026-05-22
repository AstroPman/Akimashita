-- ============================================================
-- Migration: 20260522000008_add_eyoyaku_site.sql
-- Description:
--   sites マスタに eyoyaku (e-yoyaku.jp / 駅ちか系「eネット予約」) を追加する。
--
--   e-yoyaku.jp:
--     - 運営: ranking-deli.jp グループ (駅ちか / メンズエステの口コミサイト姉妹)
--     - 多くのメンズエステ公式 HP から「WEB予約ページはコチラ」リンクで遷移する
--       汎用予約システム。1 サロン 1 shop_id。URL: https://e-yoyaku.jp/shop/{shop_id}/
--     - データは SSR HTML に全部埋まっており、内部 API・Playwright 不要 (fetch + cheerio)。
--
--   seed.sql の sites も同じ UUID で投入する。サロン本体 (salons) は本マイグレーション
--   では投入せず、staging/production では運用側で個別に追加する (men-esthe.jp 経由の
--   link_salons_to_external() で external_salon_bookings.(site_name, shop_id) から
--   自動結合される設計)。
-- ============================================================

insert into sites (id, name, base_url, search_query) values
  ('00000000-0000-0000-0000-000000000005', 'eyoyaku', 'https://e-yoyaku.jp', 'site:e-yoyaku.jp')
on conflict (id) do nothing;
