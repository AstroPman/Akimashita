-- ============================================================
-- Migration: 20260601000000_external_therapists_body_size.sql
-- Description:
--   external_therapists に 3 サイズ (bust / waist / hip) カラムを追加し、
--   既に保持している style_raw をパースして backfill する。
--
--   men-esthe.jp を再クロールせず、取得済みの style_raw を解析する方式を採る
--   (men-esthe 側の仕様変更でクロールやり直しになるリスクを避けるため)。
--
--   合わせて cup を再計算し、旧 parseStyle のバグを是正する:
--     旧実装はカップ抽出の「単独英字」正規表現が、フル 3 サイズ表記
--     ("T160/B85(E)/W56/H85" 等) の bust ラベル "B" を先に拾ってしまい、
--     大量の行で cup='B' と誤抽出していた (実測 ~5 万行)。本 backfill で
--     アプリ側 parseStyle と同一ロジックで cup を再計算して上書きする。
--
--   抽出ロジック (apps/scraper/.../menesthe/therapist_list.ts parseStyle と一致):
--     - bust : 'B' + 数値 (60-130)
--     - waist: 'W' + 数値 (40-90)
--     - hip  : 'H' + 数値 (60-130)
--     - cup  : (1) "Dカップ" 等の明示表記を最優先 (大文字, T除く)
--              (2) バスト直後の括弧内 "B85(E)" / "B(D)" / "B:85cm(D)"
--              (3) B/W/H の採寸ラベルを含むが括弧カップが無ければ null
--              (4) それ以外は単独英字 (A-S,U-Z; 身長 T は除外)
--   ※ Postgres 正規表現は先読み非対応のため、アプリ側も先読みを使わない実装に
--     揃えてある。全角英数字は translate で半角化してから解析する。
-- ============================================================

alter table external_therapists
  add column if not exists bust  int,
  add column if not exists waist int,
  add column if not exists hip   int;

-- ============================================================
-- backfill: 既存 style_raw をパースして bust/waist/hip を埋め、cup を是正する。
-- ============================================================
with norm as (
  select
    id,
    translate(
      style_raw,
      '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ',
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    ) as sr
  from external_therapists
  where style_raw is not null and style_raw <> ''
),
parsed as (
  select
    id,
    (regexp_match(sr, 'B[.:：．]?\s*(\d{2,3})'))[1]::int                                  as b,
    (regexp_match(sr, 'W[.:：．]?\s*(\d{2,3})'))[1]::int                                  as w,
    (regexp_match(sr, 'H[.:：．]?\s*(\d{2,3})'))[1]::int                                  as h,
    (regexp_match(sr, '([A-SU-Z])\s*カップ'))[1]                                          as kana_cup,
    (regexp_match(sr, 'B[.:：．]?\s*\d{0,3}\s*(?:cm|㎝)?\s*[(（]\s*([A-Za-z])\s*[)）]'))[1] as paren_cup,
    (regexp_match(sr, '(?:^|[^A-Za-z])([A-SU-Z])(?:$|[^A-Za-z])'))[1]                     as alone_cup,
    (sr ~ '[BWH][.:：．]?\d{2,3}')                                                        as has_meas
  from norm
)
update external_therapists et
set
  bust  = case when p.b between 60 and 130 then p.b end,
  waist = case when p.w between 40 and 90  then p.w end,
  hip   = case when p.h between 60 and 130 then p.h end,
  cup   = case
            when p.kana_cup  is not null then upper(p.kana_cup)
            when p.paren_cup is not null then upper(p.paren_cup)
            when p.has_meas              then null
            else upper(p.alone_cup)
          end
from parsed p
where et.id = p.id;
