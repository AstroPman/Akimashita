-- ============================================================
-- Migration: 20260516000002_get_public_salon_therapists.sql
-- Description:
--   PR-3: サロン詳細ページ / /watches 系で利用する公開 RPC を追加。
--
--   - get_public_salon_therapists(p_salon_id uuid)
--     1 サロン配下の在籍セラピスト一覧を、外部ポータル由来の
--     リッチ情報 (写真 / 年齢 / スタイル / 紹介文 / 公式 HP URL) で
--     エンリッチして返す。退店扱いのセラピストは含めない。
-- ============================================================


create or replace function get_public_salon_therapists(
  p_salon_id uuid
)
returns table (
  id                    uuid,
  name                  text,
  display_name          text,
  age                   int,
  height                int,
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
