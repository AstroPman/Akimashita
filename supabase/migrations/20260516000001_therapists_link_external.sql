-- ============================================================
-- Migration: 20260516000001_therapists_link_external.sql
-- Description:
--   PR-2: 自社 therapists と外部ポータル参照 (external_therapists) を紐付ける。
--
--   - therapists.external_therapist_id を追加 (NULL 許可、論理リンク)。
--     スクレイパ 'link' フェーズが link_therapists_to_external() を呼ぶことで
--     自動で埋まる。
--   - 紐付けは 2 段階:
--       (A+) external_therapists.therapist_url を予約システム URL パターンに
--            突き合わせ、(site, shop_id, therapist_id) が一致すれば deterministic
--            に紐付ける。
--       (A)  A+ で外れたものを、salons.external_salon_id 配下で
--            正規化済みの name (年齢括弧を剥離) で完全一致させる。
--            同名重複 (>=2) のセラピストは曖昧として無視する。
--   - service_role からのみ呼び出される。SECURITY DEFINER は付けない。
-- ============================================================


-- ============================================================
-- therapists.external_therapist_id を追加
-- on delete set null: 外部ポータル側で消えても therapists は残す。
-- (退店は deleted_at で表現するため通常 cascade は走らない)
-- ============================================================
alter table therapists
  add column external_therapist_id uuid
    references external_therapists(id) on delete set null;

create index idx_therapists_external_therapist_id
  on therapists(external_therapist_id)
  where external_therapist_id is not null;


-- ============================================================
-- link_therapists_to_external()
--
-- 外部 therapists → 自社 therapists の紐付けを 2 段階で実行する。
--
-- 戻り値: 今回新規にリンクできた件数 (A+ + A の合算)
-- ============================================================
create or replace function link_therapists_to_external()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_a_plus int := 0;
  v_a      int := 0;
begin
  -- ============================================================
  -- A+ パス: therapist_url を予約システム URL パターンにマッチさせ、
  --         (site_name, shop_id, therapist_id) が一致した行に直接 link する。
  --
  -- 観測パターン:
  --   caskan : https?://r.caskan.jp/{shop}/cast/{cast_id}
  --   grow   : https?://grow-appt.com/.../staff_id={N} or staff_no={N}
  --   estama : https?://estama.jp/shop/{shop}/cast/{N}/
  -- (edc は per-staff の URL がベンダー側に存在しないため A+ では拾えない)
  -- ============================================================
  with extracted as (
    select
      et.id as ext_id,
      case
        when et.therapist_url ~* 'r\.caskan\.jp/[^/?#]+/cast/' then 'caskan'
        when et.therapist_url ~* 'grow-appt\.com/.*staff_(?:id|no)='  then 'grow'
        when et.therapist_url ~* 'estama\.jp/shop/[^/]+/cast/\d+'     then 'estama'
        else null
      end as site_name,
      case
        when et.therapist_url ~* 'r\.caskan\.jp/[^/?#]+/cast/'
          then (regexp_match(et.therapist_url, 'r\.caskan\.jp/([^/?#]+)/cast/', 'i'))[1]
        when et.therapist_url ~* 'grow-appt\.com/.*[?&]SID='
          then (regexp_match(et.therapist_url, '[?&]SID=([A-Za-z0-9]+)', 'i'))[1]
        when et.therapist_url ~* 'grow-appt\.com/reserve/[A-Za-z0-9]+/'
          then (regexp_match(et.therapist_url, 'grow-appt\.com/reserve/([A-Za-z0-9]+)/', 'i'))[1]
        when et.therapist_url ~* 'estama\.jp/shop/[^/]+/cast/\d+'
          then (regexp_match(et.therapist_url, 'estama\.jp/shop/([^/?#]+)/cast/\d+', 'i'))[1]
        else null
      end as shop_id,
      case
        when et.therapist_url ~* 'r\.caskan\.jp/[^/?#]+/cast/'
          then (regexp_match(et.therapist_url, 'r\.caskan\.jp/[^/?#]+/cast/([^/?#]+)', 'i'))[1]
        when et.therapist_url ~* 'grow-appt\.com/.*staff_(?:id|no)='
          then (regexp_match(et.therapist_url, 'staff_(?:id|no)=(\d+)', 'i'))[1]
        when et.therapist_url ~* 'estama\.jp/shop/[^/]+/cast/\d+'
          then (regexp_match(et.therapist_url, 'estama\.jp/shop/[^/?#]+/cast/(\d+)', 'i'))[1]
        else null
      end as therapist_id
    from external_therapists et
    where et.deleted_at  is null
      and et.therapist_url is not null
  ),
  candidates as (
    select
      t.id      as therapists_id,
      x.ext_id  as ext_id
    from extracted x
    join external_therapists et on et.id = x.ext_id
    join salons    s on s.external_salon_id = et.external_salon_id
                    and s.deleted_at is null
    join sites     st on st.id = s.site_id
                     and st.name = x.site_name
                     and s.shop_id = x.shop_id
    join therapists t on t.salon_id     = s.id
                     and t.therapist_id = x.therapist_id
                     and t.deleted_at   is null
                     and t.external_therapist_id is null
    where x.site_name    is not null
      and x.shop_id      is not null
      and x.therapist_id is not null
  ),
  updated_a_plus as (
    update therapists t
       set external_therapist_id = c.ext_id
      from candidates c
     where t.id = c.therapists_id
    returning t.id
  )
  select count(*)::int into v_a_plus from updated_a_plus;

  -- ============================================================
  -- A パス: name 正規化マッチ (salon scope, 同名重複なしに限る)
  --
  -- 正規化: 末尾の `(数字)` 括弧を剥離 → 全角/半角空白を圧縮 → trim → lower
  -- 同一サロン内で重複していない場合のみ採用。曖昧時は触らない。
  -- 既に external_therapist_id が入っている therapists は対象外。
  -- ============================================================
  with normalized_ext as (
    select
      et.id                as ext_id,
      et.external_salon_id,
      lower(
        btrim(
          regexp_replace(
            regexp_replace(et.name, '\s*[（(]\s*\d+\s*[)）]\s*$', ''),
            '\s+',
            ' ',
            'g'
          )
        )
      ) as name_norm
    from external_therapists et
    where et.deleted_at is null
  ),
  normalized_t as (
    select
      t.id        as therapists_id,
      t.salon_id,
      lower(
        btrim(
          regexp_replace(
            regexp_replace(t.name, '\s*[（(]\s*\d+\s*[)）]\s*$', ''),
            '\s+',
            ' ',
            'g'
          )
        )
      ) as name_norm
    from therapists t
    where t.deleted_at is null
      and t.external_therapist_id is null
  ),
  ext_unique as (
    select ne.ext_id, s.id as salon_id, ne.name_norm
    from normalized_ext ne
    join salons s on s.external_salon_id = ne.external_salon_id
                 and s.deleted_at is null
    where ne.name_norm <> ''
    -- 同一サロン配下に同名外部セラピストが複数いる場合 (極稀) は曖昧として除外
    and not exists (
      select 1
      from normalized_ext ne2
      join salons s2 on s2.external_salon_id = ne2.external_salon_id
                    and s2.deleted_at is null
      where s2.id = s.id
        and ne2.name_norm = ne.name_norm
        and ne2.ext_id <> ne.ext_id
    )
  ),
  internal_unique as (
    select nt.therapists_id, nt.salon_id, nt.name_norm
    from normalized_t nt
    where nt.name_norm <> ''
      and not exists (
        select 1
        from normalized_t nt2
        where nt2.salon_id = nt.salon_id
          and nt2.name_norm = nt.name_norm
          and nt2.therapists_id <> nt.therapists_id
      )
  ),
  candidates as (
    select iu.therapists_id, eu.ext_id
    from internal_unique iu
    join ext_unique     eu on eu.salon_id = iu.salon_id
                          and eu.name_norm = iu.name_norm
  ),
  updated_a as (
    update therapists t
       set external_therapist_id = c.ext_id
      from candidates c
     where t.id = c.therapists_id
       and t.external_therapist_id is null
    returning t.id
  )
  select count(*)::int into v_a from updated_a;

  return coalesce(v_a_plus, 0) + coalesce(v_a, 0);
end;
$$;

revoke all on function link_therapists_to_external() from public;
grant execute on function link_therapists_to_external() to service_role;
