-- ============================================================
-- Migration: 20260516000003_get_public_therapists.sql
-- Description:
--   公開セラピスト検索 (cross-salon) 向け RPC を追加。
--   /salons の公開検索ページがセラピスト軸の検索結果を引くときに利用する。
--
--   引数:
--     p_salon_query     サロン名 ILIKE (NULL/空でフィルタ無効)
--     p_therapist_query セラピスト名 / display_name ILIKE (同上)
--     p_area            external_areas.name 完全一致 (NULL/空でフィルタ無効)
--                       external_salons.areas[] に含まれるかで判定
--     p_limit / p_offset ページネーション
--
--   戻り値:
--     セラピスト 1 行 + 所属サロンメタ + 同じクエリでの全件数 (total_count)。
--     total_count はウィンドウ関数で同時取得し、ページネーション UI の
--     「N 件中 K-M 件表示」表示に使う。
--
--   実装メモ:
--     `language sql` + `set search_path` だと function inlining が走らず
--     パラメータ化されたまま全件評価される (100倍以上遅い) ため、
--     フィルタ条件はネストせずトップレベルの WHERE 句にフラットに書く。
-- ============================================================


drop function if exists get_public_therapists(text, text, text, int, int);

create or replace function get_public_therapists(
  p_salon_query     text default null,
  p_therapist_query text default null,
  p_area            text default null,
  p_limit           int  default 60,
  p_offset          int  default 0
)
returns table (
  id                 uuid,
  name               text,
  display_name       text,
  age                int,
  height             int,
  cup                text,
  style_raw          text,
  primary_image_url  text,
  comment            text,
  salon_id           uuid,
  salon_name         text,
  prefecture         text,
  areas              text[],
  total_count        bigint
)
language sql
stable
set search_path = public
as $$
  with matched as (
    select
      t.id                                        as id,
      coalesce(et.name, t.name)                   as name,
      coalesce(et.display_name, t.name)           as display_name,
      coalesce(et.age, t.age)                     as age,
      coalesce(et.height, t.height)               as height,
      coalesce(et.cup, t.cup)                     as cup,
      et.style_raw                                as style_raw,
      coalesce(et.primary_image_url, t.image_url) as primary_image_url,
      coalesce(et.comment, t.description)         as comment,
      s.id                                        as salon_id,
      s.name                                      as salon_name,
      es.prefecture                               as prefecture,
      coalesce(es.areas, '{}'::text[])            as areas,
      case when et.id is not null then 0 else 1 end as enrich_rank
    from therapists t
    join salons s
      on s.id = t.salon_id
     and s.deleted_at is null
    left join external_therapists et
      on et.id = t.external_therapist_id
     and et.deleted_at is null
    left join external_salons es
      on es.id = s.external_salon_id
     and es.deleted_at is null
    where t.deleted_at is null
      and (
        coalesce(p_salon_query, '') = ''
        or s.name ilike '%' || p_salon_query || '%'
      )
      and (
        coalesce(p_therapist_query, '') = ''
        or coalesce(et.name, t.name)         ilike '%' || p_therapist_query || '%'
        or coalesce(et.display_name, t.name) ilike '%' || p_therapist_query || '%'
      )
      and (
        coalesce(p_area, '') = ''
        or p_area = any(coalesce(es.areas, '{}'::text[]))
      )
  )
  select
    m.id,
    m.name,
    m.display_name,
    m.age,
    m.height,
    m.cup,
    m.style_raw,
    m.primary_image_url,
    m.comment,
    m.salon_id,
    m.salon_name,
    m.prefecture,
    m.areas,
    count(*) over () as total_count
  from matched m
  order by m.enrich_rank asc, m.name asc, m.id asc
  limit greatest(coalesce(p_limit, 60), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function get_public_therapists(text, text, text, int, int)
  to anon, authenticated, service_role;
