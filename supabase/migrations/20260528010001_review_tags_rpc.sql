-- ============================================================
-- Migration: 20260528010001_review_tags_rpc.sql
-- Description:
--   PR2 で追加した review_tags / review_tag_assignments に合わせて
--   口コミ RPC を拡張する。
--
--   - submit_review                          : p_new_tag_labels 引数を追加。
--                                              ユーザ自由入力タグを kind='sensitive',
--                                              approved=false で作成し、トリガーで
--                                              reviews.visibility='paid_only' に強制。
--   - get_published_reviews_for_therapist    : 各レビューのタグ ID / ラベル / kind を jsonb 配列で同梱して返す。
--                                              ただし review_tags の RLS / 承認条件と
--                                              二重ガードになるよう、関数内でも approved 条件を絞り、
--                                              "承認されたタグ + 投稿者本人のタグ" のみ返す。
--   - get_therapist_tag_counts               : セラピストごとのタグ別件数 (chip サマリ用)。
--                                              承認済みタグのみ集計。
--   - get_therapist_review_aggregate         : paid_only_count を追加返却 (paywall CTA 用)。
--
--   既存シグネチャを変えるものは drop & create で置き換える。
-- ============================================================


-- ============================================================
-- 既存関数の drop (シグネチャが変わるため create or replace では衝突)
-- ============================================================
drop function if exists public.submit_review(
  uuid, int, text, text, text, int, text
);
drop function if exists public.get_published_reviews_for_therapist(
  uuid, int, int, boolean
);
drop function if exists public.get_therapist_review_aggregate(uuid);


-- ============================================================
-- submit_review (タグ対応版)
--
-- 認証ユーザの口コミを 1 件挿入する。
--
--   - p_new_tag_labels: ユーザが自由入力した新規タグの表示ラベル配列。
--     新規タグは kind='sensitive', is_official=false, approved=false で作成。
--     `recompute_review_visibility_for` トリガーで自動的に visibility='paid_only' になる。
--   - 1 投稿あたり最大 5 タグまで (フォーム側でも上限制御)。
--   - 同一 label の **承認済み** タグが既に存在すればそれに合流 (重複作成防止)。
-- ============================================================
create or replace function public.submit_review(
  p_therapist_id     uuid,
  p_rating           int,
  p_body             text default null,
  p_visit_year_month text default null,  -- 'YYYY-MM' 形式
  p_course_label     text default null,
  p_course_price_yen int  default null,
  p_display_name     text default null,
  p_new_tag_labels   text[] default null
)
returns table (
  id     uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_visit_date  date;
  v_review_id   uuid;
  v_tag_id      uuid;
  v_label       text;
  v_normalized  text;
  v_slug        text;
  v_label_count int;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from therapists t
    where t.id = p_therapist_id and t.deleted_at is null
  ) then
    raise exception 'therapist not found' using errcode = 'P0002';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;

  v_label_count := coalesce(array_length(p_new_tag_labels, 1), 0);
  if v_label_count > 5 then
    raise exception 'too many tag labels (max 5)' using errcode = '22023';
  end if;

  if p_visit_year_month is not null and p_visit_year_month <> '' then
    if p_visit_year_month !~ '^\d{4}-\d{2}$' then
      raise exception 'visit_year_month must be YYYY-MM' using errcode = '22023';
    end if;
    v_visit_date := (p_visit_year_month || '-01')::date;
  else
    v_visit_date := null;
  end if;

  insert into reviews (
    therapist_id,
    user_id,
    rating_overall,
    body,
    visit_year_month,
    course_label,
    course_price_yen,
    display_name,
    status,
    visibility
  )
  values (
    p_therapist_id,
    v_user_id,
    p_rating,
    nullif(btrim(coalesce(p_body, '')), ''),
    v_visit_date,
    nullif(btrim(coalesce(p_course_label, '')), ''),
    p_course_price_yen,
    nullif(btrim(coalesce(p_display_name, '')), ''),
    'pending',
    'public'  -- 直後にトリガーで paid_only に切り替わる (sensitive タグ付与時)
  )
  returning reviews.id into v_review_id;

  -- 新規タグの作成と紐付け。
  --   - kind='sensitive' 固定 (運営承認時に safe に降格できる)
  --   - approved=false で承認待ち
  --   - is_official=false (公式タグなし)
  --   - 同じ label の承認済みタグが既にあれば、それに合流
  if v_label_count > 0 then
    foreach v_label in array p_new_tag_labels loop
      v_normalized := btrim(coalesce(v_label, ''));
      if v_normalized = '' or char_length(v_normalized) > 20 then
        continue;
      end if;

      -- 同一 label の承認済みタグがあればそれに合流。
      select t.id into v_tag_id
        from review_tags t
       where t.label = v_normalized
         and t.deleted_at is null
         and t.approved
       limit 1;

      if v_tag_id is null then
        -- 英文 ID slug を割り当てる。表示ラベル自体は DB の slug には残さない。
        v_slug := 'tag_user_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
        -- returns table の出力パラメータ `id` と曖昧になるため、
        -- returning は必ずテーブル名で修飾する。
        insert into review_tags (slug, label, kind, is_official, approved, created_by)
        values (v_slug, v_normalized, 'sensitive', false, false, v_user_id)
        returning review_tags.id into v_tag_id;
      end if;

      insert into review_tag_assignments (review_id, tag_id)
      values (v_review_id, v_tag_id)
      on conflict do nothing;
    end loop;
  end if;

  return query
    select v_review_id as id, 'pending'::text as status;
end;
$$;

grant execute on function public.submit_review(
  uuid, int, text, text, text, int, text, text[]
) to authenticated;


-- ============================================================
-- get_published_reviews_for_therapist (タグ情報付き)
--
-- 各レビューに「他のユーザにも見せていいタグ」だけを jsonb 配列で同梱して返す。
-- 二重ガード:
--   1. RLS の review_tags_select_visible
--   2. 関数本体の where 句で approved=true に限定
-- 投稿者本人だけが見るべき未承認タグは、別 RPC (`get_my_review_tags`) で
-- 取得する設計にして混線を防ぐ (本 PR では未実装、PR3 以降で必要なら追加)。
-- ============================================================
create or replace function public.get_published_reviews_for_therapist(
  p_therapist_id      uuid,
  p_limit             int default 10,
  p_offset            int default 0,
  p_include_sensitive boolean default false
)
returns table (
  id                uuid,
  rating_overall    smallint,
  body              text,
  visit_year_month  date,
  course_label      text,
  course_price_yen  int,
  display_name      text,
  visibility        text,
  helpful_count     int,
  created_at        timestamptz,
  tags              jsonb,
  total_count       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select r.*
    from reviews r
    where r.therapist_id = p_therapist_id
      and r.status       = 'published'
      and r.deleted_at   is null
      and (
        r.visibility = 'public'
        or (p_include_sensitive and r.visibility = 'paid_only')
      )
  ),
  paged as (
    select f.*
    from filtered f
    order by f.created_at desc, f.id desc
    limit greatest(p_limit, 0)
    offset greatest(p_offset, 0)
  ),
  agg_tags as (
    select rta.review_id,
           jsonb_agg(
             jsonb_build_object(
               'id',    t.id,
               'slug',  t.slug,
               'label', t.label,
               'kind',  t.kind
             )
             order by t.usage_count desc, t.label
           ) as tags
      from review_tag_assignments rta
      join review_tags t on t.id = rta.tag_id
     where rta.review_id in (select id from paged)
       and t.deleted_at is null
       and t.approved  -- 承認済みタグのみ他人に見せる
     group by rta.review_id
  )
  select
    p.id,
    p.rating_overall,
    p.body,
    p.visit_year_month,
    p.course_label,
    p.course_price_yen,
    p.display_name,
    p.visibility,
    p.helpful_count,
    p.created_at,
    coalesce(at.tags, '[]'::jsonb) as tags,
    (select count(*) from filtered) as total_count
  from paged p
  left join agg_tags at on at.review_id = p.id
  order by p.created_at desc, p.id desc;
$$;

grant execute on function public.get_published_reviews_for_therapist(uuid, int, int, boolean)
  to anon, authenticated, service_role;


-- ============================================================
-- get_therapist_review_aggregate (paid_only_count を追加返却)
--
-- - review_count / average_rating は visibility='public' のみ集計
--   (sensitive な評価を Google に流さないため AggregateRating JSON-LD は public のみ)
-- - paid_only_count は visibility='paid_only' の件数。未課金ユーザに
--   「N 件の限定口コミ」CTA を出すための件数表示用。
-- ============================================================
create or replace function public.get_therapist_review_aggregate(
  p_therapist_id uuid
)
returns table (
  review_count     int,
  average_rating   numeric,
  paid_only_count  int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where visibility = 'public')::int                    as review_count,
    case
      when count(*) filter (where visibility = 'public') = 0 then null
      else round(
        avg(rating_overall) filter (where visibility = 'public')::numeric,
        2
      )
    end                                                                    as average_rating,
    count(*) filter (where visibility = 'paid_only')::int                 as paid_only_count
  from reviews
  where therapist_id = p_therapist_id
    and status       = 'published'
    and deleted_at   is null;
$$;

grant execute on function public.get_therapist_review_aggregate(uuid)
  to anon, authenticated, service_role;


-- ============================================================
-- get_therapist_tag_counts
--
-- セラピスト詳細ページのタグ chip サマリ用。
--
--   - 承認済みタグ (approved=true) のみ返す。
--   - 母集団は p_include_sensitive で制御:
--       false (default): visibility='public' な review に紐づくタグのみ集計
--       true            : public + paid_only 両方を集計 (paid ユーザ向け)
--   - 設計上、新規タグは全て kind='sensitive' で作られるため、運営が
--     何も承認しない限り chip サマリには 1 件も表示されない (=安全側)。
-- ============================================================
create or replace function public.get_therapist_tag_counts(
  p_therapist_id      uuid,
  p_include_sensitive boolean default false
)
returns table (
  id          uuid,
  slug        text,
  label       text,
  kind        text,
  count       int
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible_reviews as (
    select r.id
      from reviews r
     where r.therapist_id = p_therapist_id
       and r.status       = 'published'
       and r.deleted_at   is null
       and (
         r.visibility = 'public'
         or (p_include_sensitive and r.visibility = 'paid_only')
       )
  )
  select
    t.id,
    t.slug,
    t.label,
    t.kind,
    count(*)::int as count
  from review_tag_assignments rta
  join review_tags t on t.id = rta.tag_id
  where rta.review_id in (select id from eligible_reviews)
    and t.deleted_at is null
    and t.approved
  group by t.id, t.slug, t.label, t.kind
  order by count desc, t.label;
$$;

grant execute on function public.get_therapist_tag_counts(uuid, boolean)
  to anon, authenticated, service_role;
