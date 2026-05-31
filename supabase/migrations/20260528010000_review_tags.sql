-- ============================================================
-- Migration: 20260528010000_review_tags.sql
-- Description:
--   口コミ機能 PR2: タグ機構 (ユーザ作成タグ + 運営承認制)。
--
--   設計方針:
--     - 公式タグ (運営が seed するタグ) は持たない。投稿者が自由入力した
--       タグだけが review_tags に積み上がる。
--     - 新規タグは default で kind='sensitive', approved=false, is_official=false。
--       sensitive 扱いで安全側に倒し、レビューは自動的に paid_only ガード対象になる。
--     - 運営承認後 (approved=true) のタグは、他ユーザのレビュー閲覧時にも
--       chip として表示される。承認前は投稿者本人 (created_by = auth.uid) と
--       service_role 経由の運営だけが label を見られる。
--
--   テーブル:
--     - review_tags             : タグマスタ。slug は英文ID で固定し、
--                                  表示ラベル (label) と分離する。DB / ログには
--                                  そのまま残るので、運営は label 含む情報を
--                                  対外に流出させない運用前提。
--     - review_tag_assignments  : reviews ↔ review_tags の中間テーブル。
--                                  トリガーで:
--                                    1. review_tags.usage_count を増減
--                                    2. sensitive タグが付いた瞬間に
--                                       reviews.visibility = 'paid_only' に切替
--
--   本 PR ではタグ別セラピスト検索 RPC は作らない (PR3+)。
-- ============================================================


-- ============================================================
-- review_tags
-- ============================================================
create table review_tags (
  id            uuid primary key default gen_random_uuid(),
  -- 性的でない英文 ID。submit_review RPC が gen_random_uuid() から自動付与。
  -- DB / ログから内容を直接読み取れないようにし、表示は label 側で行う。
  slug          text not null,
  -- 表示用ラベル (ユーザの自由入力)。`#技術派` `#密着重視` 等。
  -- 投稿時に '#' プレフィックスは UI 側で外す前提だが、保存形式は自由。
  label         text not null,
  -- 'safe' か 'sensitive' か。本 PR 設計では新規タグは常に 'sensitive'。
  -- 運営が承認時に safe に降格できる余地を残すために enum で持つ。
  kind          text not null check (kind in ('safe', 'sensitive')),
  -- 公式タグかユーザ作成タグか。本 PR では常に false (公式タグなし)。
  -- 将来運営が公式タグを足す場合に true を入れる枠として残す。
  is_official   boolean not null default false,
  -- ユーザ作成タグの承認状態。承認前は created_by 本人と service_role
  -- だけが label を見られる (review_tags の RLS で制御)。
  approved      boolean not null default false,
  usage_count   int not null default 0,
  -- 作成者 (公式タグの場合は null)。
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- slug は生きているレコード内でユニーク。soft delete を考慮した部分 unique。
create unique index uniq_review_tags_slug_alive
  on review_tags (slug)
  where deleted_at is null;

-- 同一 label の重複作成を避けるため部分 unique index。
-- 「同じ表示文言の承認済みタグ」が複数できるのを防ぐ。
-- (承認前のユーザ作成タグは label が被ってもよい)
create unique index uniq_review_tags_label_approved
  on review_tags (label)
  where deleted_at is null and approved = true;

-- 「承認済みタグの集計」用 index。詳細ページの chip サマリで使う。
create index idx_review_tags_approved_usage
  on review_tags (kind, usage_count desc)
  where deleted_at is null and approved = true;

create trigger trg_review_tags_updated_at
  before update on review_tags
  for each row execute function update_updated_at();


-- ============================================================
-- review_tag_assignments
-- 中間テーブル。1 review に対して複数タグを紐づける。
-- ============================================================
create table review_tag_assignments (
  review_id   uuid not null references reviews(id) on delete cascade,
  tag_id      uuid not null references review_tags(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (review_id, tag_id)
);

-- 「セラピスト x タグの集計」用 (タグ chip サマリ)。
create index idx_review_tag_assignments_tag
  on review_tag_assignments (tag_id);


-- ============================================================
-- review_tags の usage_count 自動更新
-- ============================================================
create or replace function bump_review_tag_usage()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update review_tags
       set usage_count = usage_count + 1
     where id = new.tag_id;
    return new;
  elsif tg_op = 'DELETE' then
    update review_tags
       set usage_count = greatest(usage_count - 1, 0)
     where id = old.tag_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger trg_review_tag_assignments_bump_usage
  after insert or delete on review_tag_assignments
  for each row execute function bump_review_tag_usage();


-- ============================================================
-- sensitive タグが付与されたら reviews.visibility を paid_only に強制
--
-- 設計上は新規タグは全て sensitive で作られるため、タグが 1 つでも付いた
-- 時点で paid_only にロックされるという挙動になる。運営が承認時に
-- safe に降格しても、その直後の再計算で public に戻りうる。
--
-- レビューの visibility は次のロジック:
--   - sensitive タグが 1 つでも紐づいている → 'paid_only'
--   - すべて safe (または何も紐づいていない)  → 'public'
-- ============================================================
create or replace function recompute_review_visibility_for(review uuid)
returns void as $$
begin
  update reviews r
     set visibility = case
       when exists (
         select 1
           from review_tag_assignments rta
           join review_tags t on t.id = rta.tag_id
          where rta.review_id = r.id
            and t.kind        = 'sensitive'
            and t.deleted_at  is null
       ) then 'paid_only'
       else 'public'
     end
   where r.id = review;
end;
$$ language plpgsql security definer
   set search_path = public;

create or replace function trg_review_tag_assignments_visibility()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_review_visibility_for(new.review_id);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.recompute_review_visibility_for(old.review_id);
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer
   set search_path = public;

create trigger trg_review_tag_assignments_visibility
  after insert or delete on review_tag_assignments
  for each row execute function trg_review_tag_assignments_visibility();


-- ============================================================
-- RLS
-- ============================================================
alter table review_tags             enable row level security;
alter table review_tag_assignments  enable row level security;


-- review_tags ------------------------------------------------------------
-- 閲覧ポリシー:
--   - approved=true (運営が承認したタグ) なら全員 select 可
--   - approved=false でも created_by = auth.uid() なら本人だけ select 可
--   - service_role は RLS をバイパス (運営承認 UI / dashboard 用)
create policy "review_tags_select_visible"
  on review_tags for select
  using (
    deleted_at is null
    and (
      approved
      or created_by = auth.uid()
    )
  );

-- ユーザ作成タグの insert は submit_review RPC 経由でのみ行わせる。
-- 通常パスの insert / update / delete はクライアントから封じる。


-- review_tag_assignments -------------------------------------------------
-- 親 review の閲覧条件を踏襲する。
-- assignments を select できるかどうかは review の visibility に従う:
--   - review.status='published' AND visibility='public'                    → 全員
--   - review.status='published' AND visibility='paid_only' AND paid       → 課金者のみ
--   - review.user_id = auth.uid()                                          → 本人 (pending 含む)
--
-- ただし「assignments を見られる」ことと「joined review_tags が見られる」
-- ことは別。承認前のタグは review_tags 側の RLS でフィルタされる結果、
-- 他人にはタグの label が見えない (assignments の行は見えるが、
-- LEFT JOIN すると tag フィールドが null になる)。
create policy "review_tag_assignments_select_visible"
  on review_tag_assignments for select
  using (
    exists (
      select 1
        from reviews r
       where r.id = review_tag_assignments.review_id
         and r.deleted_at is null
         and (
           (
             r.status = 'published'
             and (
               r.visibility = 'public'
               or (
                 auth.uid() is not null
                 and public.is_subscription_active(auth.uid())
               )
             )
           )
           or r.user_id = auth.uid()
         )
    )
  );

-- assignments の insert は submit_review RPC (security definer) のみで行う。


-- ============================================================
-- NOTE: 公式タグの seed は意図的に行わない。
--
-- 新規タグは全てユーザ作成 + 運営承認制で運用する設計のため、
-- マイグレーション側では空のテーブルから始める。
-- 運営承認は service_role でレビュー & approved=true / kind 降格 を行う。
-- ============================================================
