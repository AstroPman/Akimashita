-- ============================================================
-- Migration: 20260527010001_reviews_rpc.sql
-- Description:
--   口コミ機能の SECURITY DEFINER RPC 群 (PR1 範囲)。
--
--   - submit_review                       : 認証ユーザによる新規投稿。常に status=pending で挿入。
--   - get_published_reviews_for_therapist : セラピスト詳細ページ用。visibility=public のみ
--                                            既定で返し、p_include_sensitive=true のときだけ
--                                            paid_only も含める (呼び出し側で paid 判定)。
--                                            PR1 では paid_only 行は存在しない前提だが、PR2 で
--                                            sensitive タグが入ると活きる。
--   - get_therapist_review_aggregate      : AggregateRating JSON-LD 用。visibility='public' のみ集計。
--
--   いずれも RLS と二重ガードになるよう関数本体でも条件を書く (security definer のため)。
-- ============================================================


-- ============================================================
-- submit_review
-- 認証ユーザの口コミを 1 件挿入し、id と status を返す。
-- ============================================================
create or replace function public.submit_review(
  p_therapist_id     uuid,
  p_rating           int,
  p_body             text default null,
  p_visit_year_month text default null,  -- 'YYYY-MM' 形式
  p_course_label     text default null,
  p_course_price_yen int  default null,
  p_display_name     text default null
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
  v_user_id    uuid := auth.uid();
  v_visit_date date;
  v_id         uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- 対象セラピストが存在し、退店扱いでないことを確認。
  if not exists (
    select 1 from therapists t
    where t.id = p_therapist_id and t.deleted_at is null
  ) then
    raise exception 'therapist not found' using errcode = 'P0002';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;

  -- 'YYYY-MM' を 'YYYY-MM-01' に正規化して date にキャスト。
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
    'public'
  )
  returning reviews.id into v_id;

  return query
    select v_id as id, 'pending'::text as status;
end;
$$;

grant execute on function public.submit_review(
  uuid, int, text, text, text, int, text
) to authenticated;


-- ============================================================
-- get_published_reviews_for_therapist
-- セラピスト詳細ページ用の公開済みレビュー一覧。
-- p_include_sensitive=true のときだけ visibility='paid_only' も含める。
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
  )
  select
    f.id,
    f.rating_overall,
    f.body,
    f.visit_year_month,
    f.course_label,
    f.course_price_yen,
    f.display_name,
    f.visibility,
    f.helpful_count,
    f.created_at,
    count(*) over () as total_count
  from filtered f
  order by f.created_at desc, f.id desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_published_reviews_for_therapist(uuid, int, int, boolean)
  to anon, authenticated, service_role;


-- ============================================================
-- get_therapist_review_aggregate
-- AggregateRating JSON-LD 用の集計。visibility='public' のみ。
-- ============================================================
create or replace function public.get_therapist_review_aggregate(
  p_therapist_id uuid
)
returns table (
  review_count    int,
  average_rating  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int                                  as review_count,
    case when count(*) = 0
         then null
         else round(avg(rating_overall)::numeric, 2)
    end                                            as average_rating
  from reviews
  where therapist_id = p_therapist_id
    and status       = 'published'
    and visibility   = 'public'
    and deleted_at   is null;
$$;

grant execute on function public.get_therapist_review_aggregate(uuid)
  to anon, authenticated, service_role;
