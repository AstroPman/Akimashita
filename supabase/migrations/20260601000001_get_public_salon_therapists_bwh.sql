-- ============================================================
-- Migration: 20260601000001_get_public_salon_therapists_bwh.sql
-- Description:
--   公開セラピスト RPC get_public_salon_therapists に 3 サイズ
--   (bust / waist / hip) を追加する。
--
--   方針:
--     - 3 サイズは自社 therapists を優先し、欠損時に external_therapists
--       (men-esthe.jp 由来, style_raw をパースして格納) へフォールバックする
--       (coalesce(t.x, et.x))。両ソースを合わせてカバレッジを上げる。
--     - 既存カラムの coalesce(et.x, t.x) (= external 優先) は据え置く。
--
--   RETURNS TABLE のカラム追加は戻り値型の変更にあたり create or replace では
--   できないため、先に drop してから作り直す。
-- ============================================================

drop function if exists get_public_salon_therapists(uuid);

create or replace function get_public_salon_therapists(
  p_salon_id uuid
)
returns table (
  id                    uuid,
  name                  text,
  display_name          text,
  age                   int,
  height                int,
  bust                  int,
  waist                 int,
  hip                   int,
  cup                   text,
  style_raw             text,
  primary_image_url     text,
  image_urls            text[],
  comment               text,
  profile_url           text,
  external_profile_url  text
)
language sql
stable
set search_path = public
as $$
  select
    t.id                                       as id,
    -- name は外部ポータル側を優先 (年齢括弧を剥離した綺麗な名前)。なければ自社の name。
    coalesce(et.name, t.name)                  as name,
    -- display_name は表示用 (例: "メイ (28)")。external が無ければ自社 name に fallback。
    coalesce(et.display_name, t.name)          as display_name,
    coalesce(et.age, t.age)                    as age,
    coalesce(et.height, t.height)              as height,
    -- 3 サイズは自社 therapists を優先し、欠損時に external へフォールバック。
    coalesce(t.bust,  et.bust)                 as bust,
    coalesce(t.waist, et.waist)                as waist,
    coalesce(t.hip,   et.hip)                  as hip,
    coalesce(et.cup, t.cup)                    as cup,
    et.style_raw                               as style_raw,
    -- 写真は外部の primary_image_url を優先。無ければ自社 image_url。
    coalesce(et.primary_image_url, t.image_url) as primary_image_url,
    coalesce(et.image_urls, '{}'::text[])      as image_urls,
    coalesce(et.comment, t.description)        as comment,
    -- profile_url: 我々の予約システム上のセラピスト URL (実予約への動線)。
    t.profile_url                              as profile_url,
    -- external_profile_url: サロン公式 HP の cast 詳細 URL。
    et.therapist_url                           as external_profile_url
  from therapists t
  left join external_therapists et
    on et.id = t.external_therapist_id
   and et.deleted_at is null
  where t.salon_id    = p_salon_id
    and t.deleted_at  is null
  order by
    -- 外部 enrich 済みを先頭に持ってくる (UI 上の見栄え優先)
    case when et.id is not null then 0 else 1 end,
    coalesce(et.name, t.name) asc;
$$;

grant execute on function get_public_salon_therapists(uuid)
  to anon, authenticated, service_role;
