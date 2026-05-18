-- ============================================================
-- Migration: 20260516000000_external_therapists.sql
-- Description:
--   外部ポータル (men-esthe.jp 等) から取得したセラピストマスタを保持する
--   参照テーブルを追加する。本MR (PR-1) では我々の `therapists` テーブルとは
--   結合せず、reference DB として独立に育てる。
--
--   - external_therapists: セラピスト詳細
--     (写真URL配列, 年齢, 身長, カップ, 紹介文, 公式HP cast URL 等)
--   - external_salons.therapists_synced_at: セラピスト同期のしきい値カラム
--
--   後続MRで therapists.external_therapist_id を追加し、
--   (A+) external_therapists.therapist_url の予約システムURL パース → (A) 同一サロン
--   配下での name 正規化マッチで紐付けを行う。
-- ============================================================


-- ============================================================
-- external_salons に therapists_synced_at を追加
-- セラピスト一覧の段階同期しきい値カラム。
-- ============================================================
alter table external_salons
  add column therapists_synced_at timestamptz;

-- bookings_synced_at と同じ運用方針: NULL を先頭に並べて未同期から処理する。
create index idx_external_salons_therapists_synced_at
  on external_salons(therapists_synced_at nulls first)
  where deleted_at is null;


-- ============================================================
-- external_therapists
-- 外部ポータルのセラピストマスタ。サロン単位の JSON API
-- (例: men-esthe.jp の therapistlist.php?id={salon_id}&more)
-- から取得した行をそのまま保持する。
--
-- - source_url は men-esthe.jp 上のセラピスト詳細ページ
--   (https://men-esthe.jp/therapist.php?id=...)
-- - therapist_url はサロン公式 HP 上の cast 詳細
--   (例: https://a-elegance.com/cast/detail.php?girl=482)
--   後続の link RPC で予約システム URL パターンに合致した場合のみ
--   deterministic な紐付けに使う。
-- - status は外部ポータル側の値 (1=在籍 / 2=退店) をそのまま保持。
-- - 退店 (status=2) または JSON から消失したセラピストは
--   deleted_at を打って論理削除し、UI 側の SELECT から外す。
-- ============================================================
create table external_therapists (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null,                       -- 'menesthe'
  source_id           text not null,                       -- '230912'
  external_salon_id   uuid not null references external_salons(id) on delete cascade,
  name                text not null,                       -- 'メイ' (parens 剥離後)
  display_name        text,                                -- 'メイ (28)' (生)
  kana                text,
  age                 int,
  height              int,                                 -- 'T153 G' → 153
  cup                 text,                                -- 'G'
  style_raw           text,                                -- 'T153 G'
  image_urls          text[] default '{}'::text[] not null, -- 絶対URL配列
  primary_image_url   text,                                -- 最初の画像 = image1
  therapist_url       text,                                -- 公式HP cast URL
  comment             text,                                -- 紹介文
  status              int,                                 -- 1=在籍 / 2=退店
  source_updated_at   timestamptz,                         -- ポータル側の updated_at
  source_url          text,                                -- https://men-esthe.jp/therapist.php?id=...
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null,
  deleted_at          timestamptz,
  unique(source, source_id)
);

create index idx_external_therapists_source
  on external_therapists(source);
create index idx_external_therapists_external_salon_id
  on external_therapists(external_salon_id);
create index idx_external_therapists_therapist_url
  on external_therapists(therapist_url)
  where therapist_url is not null;


-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
create trigger trg_external_therapists_updated_at
  before update on external_therapists
  for each row execute function update_updated_at();


-- ============================================================
-- RLS
-- 参照テーブルなので誰でも select 可、書き込みは service_role のみ。
-- ============================================================
alter table external_therapists enable row level security;

create policy "external_therapists_select"
  on external_therapists for select using (true);
