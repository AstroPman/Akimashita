-- ============================================================
-- Migration: 20260531000000_fix_submit_review_ambiguous_id.sql
-- Description:
--   submit_review RPC の修正。
--
--   20260528010001_review_tags_rpc.sql で追加した submit_review は、
--   戻り値を `returns table (id uuid, status text)` で宣言しているため、
--   関数本体では `id` が出力パラメータ名として可視になる。
--   新規タグ作成時の `insert into review_tags ... returning id into v_tag_id`
--   の `id` がこの出力パラメータと曖昧になり、実行時に
--     ERROR: column reference "id" is ambiguous (SQLSTATE 42702)
--   で投稿が失敗していた。
--
--   `returning id` を `returning review_tags.id` にテーブル名修飾して解消する。
--   シグネチャは変えないため create or replace で上書きする。
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
