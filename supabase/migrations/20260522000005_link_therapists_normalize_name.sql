-- ============================================================
-- Migration: 20260522000005_link_therapists_normalize_name.sql
-- Description:
--   link_therapists_to_external() の A パス (name 一致リンク) で
--   外部 / 内部の name 差異を吸収できるよう正規化ルールを強化する。
--
--   背景:
--     - 外部ポータル (men-esthe.jp) の `external_therapists.name` は
--       「姓 名」のように 姓と名の間に半角スペースを含む（211k 件中 36% が半角スペース有）。
--     - 自社 `therapists.name` は予約システム由来で「姓名」(スペース無し) が大半。
--     - 既存の正規化は「末尾(数字)括弧剥離 + \s+ を半角 1 個に圧縮 + trim + lower」
--       のみで「外部に半角スペース有 / 内部に無し」の差を吸収できず、
--       本番では外部リンク済みサロン 942 件中 395 件が therapists 未リンクのままだった。
--     - 加えて Alto / グランマトム / Puni Spa 等のサロンでは
--       internal 側に絵文字 (🐰 🆕 🔰) や記号 (★ ♡) のプレフィックス／サフィックスが
--       付与されており、これも一致を阻害していた。
--
--   新しい正規化（ホワイトリスト方式）:
--     1. 末尾の `(数字)` 括弧（半角/全角）を剥離
--     2. lower
--     3. 「ひらがな / カタカナ / 漢字 / ASCII 英数字 / 長音 / 々」以外を全削除
--        - 半角・全角スペース、絵文字、★ ♡ ♪ などの装飾はすべて除去される
--        - 国名カナや英字名 (Anna 等) は ASCII 英数字として保持される
--
--   想定効果（本番データでの試算）:
--     - 現状: 4,839 / 34,759 therapists がリンク済み (14%)
--     - 改修後: +13,236 件追加リンク可能 (≒ 52% カバー)
--     - 同一サロン内で正規化結果が衝突するレコードは外部 4 件 / 内部 1 件のみで、
--       いずれも同一人物の重複登録に見える。既存の ambiguity guard
--       (NOT EXISTS で同サロン同 name_norm を曖昧扱い) が拾うので誤リンクは発生しない。
--
--   注意:
--     - A+ パス (URL から site/shop/therapist_id を抜くパス) は変更しない。
--     - service_role 専用関数。SECURITY DEFINER は付けない（既存と同じ）。
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
  -- (実装は 20260516000001 と同一。変更なし)
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
  -- 新正規化:
  --   1. 末尾 `(数字)` 括弧を剥離 (半角/全角どちらも)
  --   2. lower
  --   3. 「ひらがな・カタカナ・漢字・ASCII 英数字・長音・々」以外を全削除
  --
  -- これにより以下が吸収される:
  --   - 「一ノ瀬 みれい」 vs 「一ノ瀬みれい」 (半角スペース有無)
  --   - 「白川　あい」 vs 「白川あい」 (全角スペース)
  --   - 「🐰冨樫ヒソカ」 vs 「冨樫 ヒソカ」 (装飾絵文字)
  --   - 「★こころ」 vs 「こころ」 (装飾記号プレフィックス)
  --   - 「こころ♡」 vs 「こころ」 (装飾サフィックス)
  -- ============================================================
  with normalized_ext as (
    select
      et.id                as ext_id,
      et.external_salon_id,
      regexp_replace(
        lower(
          regexp_replace(et.name, '\s*[（(]\s*\d+\s*[)）]\s*$', '')
        ),
        '[^a-z0-9\u3041-\u309f\u30a0-\u30ff\u30fc\u4e00-\u9fff\u3005]',
        '',
        'g'
      ) as name_norm
    from external_therapists et
    where et.deleted_at is null
  ),
  normalized_t as (
    select
      t.id        as therapists_id,
      t.salon_id,
      regexp_replace(
        lower(
          regexp_replace(t.name, '\s*[（(]\s*\d+\s*[)）]\s*$', '')
        ),
        '[^a-z0-9\u3041-\u309f\u30a0-\u30ff\u30fc\u4e00-\u9fff\u3005]',
        '',
        'g'
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
    -- 同一サロン配下に同名外部セラピストが複数いる場合は曖昧として除外
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
