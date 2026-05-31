-- ============================================================
-- Migration: 20260531000001_drop_legacy_submit_review.sql
-- Description:
--   submit_review の関数オーバーロード衝突を解消する。
--
--   過去に適用された「タグ ID 選択あり」版の submit_review
--     submit_review(uuid, int, text, text, text, int, text, uuid[], text[])
--                   (... p_tag_ids uuid[], p_new_tag_labels text[])
--   が DB に残っており、現行の 8 引数版
--     submit_review(uuid, int, text, text, text, int, text, text[])
--                   (... p_new_tag_labels text[])
--   と共存している。どちらも p_new_tag_labels を持つため、PostgREST が
--   呼び出し時にどちらの関数かを解決できず
--     ERROR: Could not choose the best candidate function (PGRST203)
--   で投稿が失敗していた。
--
--   現行設計は公式タグ無し・ユーザ作成タグのみなので、tag_ids 付きの
--   レガシー版を drop し、8 引数版だけを残す。
-- ============================================================
drop function if exists public.submit_review(
  uuid, int, text, text, text, int, text, uuid[], text[]
);
