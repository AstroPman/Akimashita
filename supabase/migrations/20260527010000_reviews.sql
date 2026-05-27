-- ============================================================
-- Migration: 20260527010000_reviews.sql
-- Description:
--   セラピストに対する口コミ機能 (PR1: タグ無し、写真無し) のスキーマと RLS。
--
--   - reviews                : 口コミ本体。事前承認制 (status=pending → published / rejected)。
--                              visibility は PR2 でタグ機構が入った際に paid_only に切り替えるための
--                              先行カラム。PR1 では常に 'public'。
--   - review_helpful_votes   : 「参考になった」投票 (PR3 で UI を追加するが、テーブルは
--                              ここで作っておく)。
--   - review_reports         : 通報 (同上)。
--
--   タグ系テーブル (review_tags / review_tag_assignments) は PR2 で別マイグレーションを切る。
--
--   RLS は既存の watch_settings 系と同じ流儀。閲覧は status='published' の行に絞り、
--   visibility='paid_only' の場合のみ is_subscription_active() で判定する。
-- ============================================================


-- ============================================================
-- reviews
-- ============================================================
create table reviews (
  id                uuid primary key default gen_random_uuid(),
  therapist_id      uuid not null references therapists(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  rating_overall    smallint not null check (rating_overall between 1 and 5),
  -- 後から軸を追加できるよう jsonb で持つ。MVP では未使用、PR3 以降で UI を組む。
  rating_axes       jsonb not null default '{}'::jsonb,
  body              text,
  -- 訪問月の粒度。DD は 01 固定で「YYYY-MM」を表現する。
  visit_year_month  date,
  course_label      text,
  course_price_yen  int,
  -- 表示用ハンドル。null の場合は呼び出し側でイニシャル等にフォールバック。
  display_name      text,
  status            text not null default 'pending'
                    check (status in ('pending', 'published', 'rejected', 'hidden')),
  -- PR1 では常に 'public'。PR2 で sensitive タグ付与時に 'paid_only' へ自動切替する。
  visibility        text not null default 'public'
                    check (visibility in ('public', 'paid_only')),
  rejected_reason   text,
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users(id),
  helpful_count     int  not null default 0,
  reported_count    int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- 1 ユーザ × 1 セラピストにつき「生きている」口コミは 1 件まで。
-- 削除済み (deleted_at not null) は除外して許容するため部分 unique にする。
create unique index uniq_reviews_user_therapist_alive
  on reviews (user_id, therapist_id)
  where deleted_at is null;

-- セラピスト詳細ページの「公開済みレビュー一覧」アクセス用。
create index idx_reviews_therapist_status_visibility
  on reviews (therapist_id, status, visibility, created_at desc)
  where deleted_at is null;

-- 自分の投稿一覧 (/account/reviews) アクセス用。
create index idx_reviews_user_created
  on reviews (user_id, created_at desc)
  where deleted_at is null;

create trigger trg_reviews_updated_at
  before update on reviews
  for each row execute function update_updated_at();


-- ============================================================
-- review_helpful_votes
-- 「参考になった」投票 (PR3 で UI 実装、PR1 ではテーブルだけ用意)。
-- ============================================================
create table review_helpful_votes (
  review_id   uuid not null references reviews(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (review_id, user_id)
);


-- ============================================================
-- review_reports
-- 通報 (PR3 で UI 実装、PR1 ではテーブルだけ用意)。
-- ============================================================
create table review_reports (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references reviews(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  reason       text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id)
);

create index idx_review_reports_review on review_reports (review_id);


-- ============================================================
-- RLS
-- ============================================================
alter table reviews              enable row level security;
alter table review_helpful_votes enable row level security;
alter table review_reports       enable row level security;


-- reviews ----------------------------------------------------------------
-- 閲覧は public にしたいので anon/authenticated 双方を対象にする。
-- - 公開: status='published' AND deleted_at is null AND
--           ( visibility='public' OR (auth.uid() あり AND is_subscription_active=true) )
-- - 自分の行: 常に閲覧可 (pending/rejected も含めて /account/reviews で確認できる)
create policy "reviews_select_public_or_own"
  on reviews for select
  using (
    deleted_at is null
    and (
      (
        status = 'published'
        and (
          visibility = 'public'
          or (
            auth.uid() is not null
            and public.is_subscription_active(auth.uid())
          )
        )
      )
      or user_id = auth.uid()
    )
  );

-- 自分の行を作成可能。status は default の 'pending' で固定する想定だが、
-- 仮にクライアントから 'published' を渡されても下の update ポリシーで防げる。
-- with check では 'pending' を強制するため status のチェックも入れる。
create policy "reviews_insert_self_pending"
  on reviews for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and visibility = 'public'
    and deleted_at is null
  );

-- 自分の pending 行のみ更新可。published に勝手に上げられないよう with check も pending 縛り。
-- visibility / status の遷移は service_role に限定する。
create policy "reviews_update_self_pending"
  on reviews for update
  using (
    user_id = auth.uid()
    and status = 'pending'
    and deleted_at is null
  )
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- 自分の行のみ削除可。物理削除を許容 (フォーム送信し直し用)。
-- 公開済みの取り下げは update で deleted_at セットする運用も可だが、
-- PR1 ではシンプルに delete を許す (RLS で他人の行は触れない)。
create policy "reviews_delete_self"
  on reviews for delete
  using (user_id = auth.uid());


-- review_helpful_votes ---------------------------------------------------
create policy "review_helpful_votes_select"
  on review_helpful_votes for select
  using (true);

create policy "review_helpful_votes_insert_self"
  on review_helpful_votes for insert
  with check (user_id = auth.uid());

create policy "review_helpful_votes_delete_self"
  on review_helpful_votes for delete
  using (user_id = auth.uid());


-- review_reports ---------------------------------------------------------
-- 通報はプライバシー観点で「自分の通報のみ閲覧可」。
create policy "review_reports_select_self"
  on review_reports for select
  using (user_id = auth.uid());

create policy "review_reports_insert_self"
  on review_reports for insert
  with check (user_id = auth.uid());
