-- ============================================================
-- Migration: 20260522000006_link_therapists_set_timeout.sql
-- Description:
--   link_therapists_to_external() 実行中に Supabase 既定の statement_timeout
--   (PostgREST 経由で約 8s) に引っかかる事象への対処。
--
--   本番では therapists 38k 件 × external_therapists 211k 件を name 正規化付きで
--   結合するため、初回の一括リンク呼び出しが 8s を超える。関数 LOCAL に
--   statement_timeout を 10min (600s) まで引き上げて、初回の重い JOIN を許容する。
--
--   実測: 5-15s 程度で完了する想定。10min はあくまで安全側の上限値。
--
--   関数本体 (A+ / A の 2 パス) には変更を加えず、ALTER FUNCTION で
--   関数属性のみを更新する。
-- ============================================================

alter function link_therapists_to_external() set statement_timeout = '10min';
