-- ============================================================
-- Migration: 20260426000002_add_sites_salons.sql
-- Description: sitesテーブル・salonsテーブルの追加、
--              therapistsテーブルの構造変更
-- ============================================================


-- ============================================================
-- sites
-- caskan / grow-appt.com などの予約プラットフォームマスタ
-- レコードは手動 or サロン発見ジョブが参照する固定マスタ
-- ============================================================
create table sites (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,           -- 'caskan' | 'grow'
  base_url      text not null,           -- 'https://r.caskan.jp'
  search_query  text,                    -- サロン発見用Google検索クエリ（例: 'site:r.caskan.jp'）
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  deleted_at    timestamptz
);


-- ============================================================
-- salons
-- 各サロンの情報。サロン発見ジョブが自動登録する
-- ============================================================
create table salons (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  shop_id     text not null,             -- サイト内の店舗識別子（URLのスラッグなど）
  name        text not null,
  url         text,                      -- 予約ページURL
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,
  deleted_at  timestamptz,
  unique(site_id, shop_id)
);


-- ============================================================
-- therapists の変更
-- site / shop_id を削除し、salon_id で salons を参照する形に変更
-- プロフィール情報カラムを追加
-- ============================================================

-- 既存カラムを削除
alter table therapists drop column site;
alter table therapists drop column shop_id;

-- salon_id を追加
alter table therapists
  add column salon_id uuid not null references salons(id) on delete cascade;

-- unique制約を再設定（salon単位でのtherapist_idの一意性）
alter table therapists
  add constraint therapists_salon_id_therapist_id_key unique(salon_id, therapist_id);

-- プロフィール情報カラムを追加
alter table therapists add column description text;
alter table therapists add column age         integer;
alter table therapists add column height      integer;   -- 単位: cm
alter table therapists add column bust        integer;   -- 単位: cm
alter table therapists add column waist       integer;   -- 単位: cm
alter table therapists add column hip         integer;   -- 単位: cm
alter table therapists add column cup         text;      -- 例: 'A' | 'B' | 'C' ...


-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
create trigger trg_sites_updated_at
  before update on sites
  for each row execute function update_updated_at();

create trigger trg_salons_updated_at
  before update on salons
  for each row execute function update_updated_at();


-- ============================================================
-- インデックス
-- ============================================================
create index idx_salons_site_id on salons(site_id);
create index idx_therapists_salon_id on therapists(salon_id);


-- ============================================================
-- RLS 有効化
-- ============================================================
alter table sites   enable row level security;
alter table salons  enable row level security;

-- sites / salons は全員参照可、書き込みはservice_roleのみ
create policy "sites_select"  on sites  for select using (true);
create policy "salons_select" on salons for select using (true);


-- ============================================================
-- sitesの初期データ投入
-- ============================================================
insert into sites (name, base_url, search_query) values
  ('caskan', 'https://r.caskan.jp', 'site:r.caskan.jp'),
  ('grow',   'https://grow-appt.com', 'site:grow-appt.com');