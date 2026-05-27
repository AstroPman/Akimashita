-- ============================================================
-- Migration: 20260527000000_public_search_rpcs.sql
-- Description:
--   公開ページ (/ ・ /salons ・ /salons/[id] ・ /pricing) の
--   データ取得を「用途別」に分割するための RPC を追加する。
--
--   背景:
--     これまで `get_public_salons()` が全 salon を therapists JOIN +
--     GROUP BY で集計しながら 1 リクエスト 500ms 程度かけていた。
--     呼び出し元は (a) 件数だけ欲しい、(b) フィルタ後だけ欲しい、
--     (c) 単体 1 件だけ欲しい、というユースケースが混在しており、
--     用途に応じた専用 RPC へ分割することで取得コストを大幅に下げる。
--
--   追加する RPC:
--     1. get_public_stats()
--          / の `ScaleStats` および /pricing の `SupportedSalonsTeaser` 用。
--          salons / therapists の単純 count を 2 つ返す。
--     2. get_public_areas()
--          /salons のエリアセレクタ用。
--          公開対象の external_salons から prefecture × area のユニーク
--          一覧だけを返す (1 サロンあたり areas[] を unnest)。
--     3. search_public_salons(p_salon_query, p_area, p_limit, p_offset)
--          /salons のサロン軸検索結果。条件付きで salons を返し、
--          ウィンドウ関数で total_count を同時取得する (UI のページング
--          表示と件数表示に使う)。条件はトップレベルの WHERE 句に
--          フラットに書いて function inlining を効かせる
--          (cf. get_public_therapists)。
--     4. get_public_salon(p_id)
--          /salons/[id] の単体取得用。get_public_salons() を全件呼んで
--          フィルタしていた処理を pkey lookup の単体 RPC に置き換える。
--
--   既存の get_public_salons() は sitemap.xml 用 (id 列挙) として
--   残す。本 PR ではフロント側を新 RPC に切り替えるが RPC 自体は
--   削除しない。後続 PR で利用箇所が完全に sitemap だけになったタイ
--   ミングで「id だけ返す軽量版」への移行を検討する。
-- ============================================================


-- ============================================================
-- 1. get_public_stats(): salon / therapist の合計件数
--
-- 公開サロン数と公開セラピスト数だけを返す軽量カウント。
-- ScaleStats / SupportedSalonsTeaser から呼ばれる想定で、
-- 数値以外のメタ情報は含めない。
--
-- 性能メモ:
--   公開セラピストの行数は数万件のスケールで、`deleted_at is null`
--   フィルタを持つ count(*) はインデックスを利用できず Seq Scan に
--   なるため数百 ms かかる。フロント側で公開ページ毎リクエスト呼ぶと
--   重いので、後続フェーズで Next.js 16 の `"use cache"` などの
--   データキャッシュを噛ませる前提とする。さらに踏み込んだ最適化が
--   必要になったら therapists に partial index を追加する。
-- ============================================================
create or replace function get_public_stats()
returns table (
  salon_count     int,
  therapist_count int
)
language sql
stable
set search_path = public
as $$
  select
    (select count(*)::int from salons     where deleted_at is null) as salon_count,
    (select count(*)::int from therapists where deleted_at is null) as therapist_count;
$$;

grant execute on function get_public_stats()
  to anon, authenticated, service_role;


-- ============================================================
-- 2. get_public_areas(): 公開サロンが属するエリアのユニーク一覧
--
-- 公開対象 salons に紐付く external_salons の (prefecture, area) を
-- 取得する。一覧は /salons のエリアセレクタ Popover に投入する。
--
-- 注意:
--   - external_salons.areas[] を `unnest` で行展開し、prefecture と
--     エリア名のユニーク組を返す。
--   - prefecture が NULL の salon は表示先 (セレクタの heading) が
--     決まらないので除外する。
-- ============================================================
create or replace function get_public_areas()
returns table (
  prefecture text,
  area       text
)
language sql
stable
set search_path = public
as $$
  select distinct
    es.prefecture                 as prefecture,
    unnested.area                 as area
  from salons s
  join external_salons es
    on es.id = s.external_salon_id
   and es.deleted_at is null
  cross join lateral unnest(es.areas) as unnested(area)
  where s.deleted_at is null
    and es.prefecture is not null
  order by prefecture asc, area asc;
$$;

grant execute on function get_public_areas()
  to anon, authenticated, service_role;


-- ============================================================
-- 3. search_public_salons(): 条件付き公開サロン検索 (+ total_count)
--
-- 引数:
--   p_salon_query サロン名 ILIKE (NULL/空でフィルタ無効)
--   p_area        external_salons.areas[] に含まれるかで判定
--   p_limit       1 ページ件数 (default 2000 / max 2000)
--   p_offset      ページネーション offset
--
-- 戻り値:
--   1 サロン 1 行 + therapist_count + (prefecture, areas) +
--   フィルタ条件全件の総数 (total_count, ウィンドウ関数で同時取得)。
--
-- 実装メモ:
--   - `set search_path` を付ける必要があるため `language sql` で
--     宣言する。フィルタ条件はトップレベル WHERE にフラットに書き、
--     get_public_therapists と同様に function inlining を効かせる。
--   - 並び替えはサロン名昇順。
--   - p_limit には妥当な上限 (2000) を設けて巨大クエリを防ぐ。
--     公開対象 salons の総数が 2000 を大幅に超えるようになったら
--     フロント側でページング UI を導入する。
-- ============================================================
create or replace function search_public_salons(
  p_salon_query text default null,
  p_area        text default null,
  p_limit       int  default 2000,
  p_offset      int  default 0
)
returns table (
  id              uuid,
  name            text,
  therapist_count int,
  prefecture      text,
  areas           text[],
  total_count     bigint
)
language sql
stable
set search_path = public
as $$
  with matched as (
    select
      s.id                                       as id,
      s.name                                     as name,
      count(t.id)::int                           as therapist_count,
      es.prefecture                              as prefecture,
      coalesce(es.areas, '{}'::text[])           as areas
    from salons s
    left join therapists t
      on t.salon_id = s.id
     and t.deleted_at is null
    left join external_salons es
      on es.id = s.external_salon_id
     and es.deleted_at is null
    where s.deleted_at is null
      and (
        coalesce(p_salon_query, '') = ''
        or s.name ilike '%' || p_salon_query || '%'
      )
      and (
        coalesce(p_area, '') = ''
        or p_area = any(coalesce(es.areas, '{}'::text[]))
      )
    group by s.id, s.name, es.prefecture, es.areas
  )
  select
    m.id,
    m.name,
    m.therapist_count,
    m.prefecture,
    m.areas,
    count(*) over () as total_count
  from matched m
  order by m.name asc
  limit least(greatest(coalesce(p_limit, 2000), 0), 2000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function search_public_salons(text, text, int, int)
  to anon, authenticated, service_role;


-- ============================================================
-- 4. get_public_salon(p_id): 単体取得
--
-- /salons/[id] および /salons/[id]/therapists/[therapist_id] の
-- 詳細ページでサロンメタを引くための単体 RPC。
-- 既存 get_public_salons() の単一行版で、pkey lookup で完了する。
-- ============================================================
create or replace function get_public_salon(p_id uuid)
returns table (
  id              uuid,
  name            text,
  therapist_count int,
  prefecture      text,
  areas           text[]
)
language sql
stable
set search_path = public
as $$
  select
    s.id                                       as id,
    s.name                                     as name,
    count(t.id)::int                           as therapist_count,
    es.prefecture                              as prefecture,
    coalesce(es.areas, '{}'::text[])           as areas
  from salons s
  left join therapists t
    on t.salon_id = s.id
   and t.deleted_at is null
  left join external_salons es
    on es.id = s.external_salon_id
   and es.deleted_at is null
  where s.id = p_id
    and s.deleted_at is null
  group by s.id, s.name, es.prefecture, es.areas;
$$;

grant execute on function get_public_salon(uuid)
  to anon, authenticated, service_role;
