-- ============================================================
-- Migration: 20260512000002_external_salons.sql
-- Description:
--   外部ポータル (men-esthe.jp 等) から取得したサロンマスタを保持する
--   参照テーブル群を追加する。本MR (PR-α) では我々の `salons` テーブルとは
--   結合せず、reference DB として独立に育てる。
--
--   - external_areas: ポータル提供のエリアID/名称/都道府県/地区
--   - external_salons: サロン詳細 (公式URL, エリア配列, 価格帯 等)
--   - external_salon_bookings: 公式URL から検出した予約システム URL
--
--   後続MR (PR-β) で salons.external_salon_id を追加し、
--   external_salon_bookings.(site_name, shop_id) を介して結合する設計。
-- ============================================================


-- ============================================================
-- external_areas
-- 外部ポータルの「エリア」マスタ。area-list.php から取得。
-- (source, source_id) で一意。同一 source 内のエリアID参照に使う。
-- ============================================================
create table external_areas (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,             -- 'menesthe'
  source_id   text not null,             -- '18' (area.php?id=18)
  name        text not null,             -- '新橋・銀座'
  district    text,                      -- '銀座・麻布エリア'
  prefecture  text,                      -- '東京都'
  source_url  text,                      -- 例: https://men-esthe.jp/area.php?id=18
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,
  unique(source, source_id)
);

create index idx_external_areas_source on external_areas(source);
create index idx_external_areas_prefecture on external_areas(prefecture);


-- ============================================================
-- external_salons
-- 外部ポータルのサロンマスタ。エリア一覧 + 詳細ページを統合して保持。
--
-- `details_synced_at` が NULL の行は「エリア一覧で見つけたが詳細未取得」の
-- shell record。詳細取得ジョブが埋めていく前提。
-- `area_source_ids` は external_areas.source_id を参照する弱リンク
-- (外部キー制約はかけない: ポータル側のID変化に対する耐性のため)。
-- ============================================================
create table external_salons (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null,
  source_id          text not null,
  name               text not null,
  prefecture         text,                              -- 詳細ページの主エリアから派生
  areas              text[] default '{}'::text[] not null,        -- エリア名 (例: '新橋・銀座')
  area_source_ids    text[] default '{}'::text[] not null,        -- 外部エリアID (例: '18')
  nearest_stations   text[] default '{}'::text[] not null,        -- 最寄り駅名
  genre              text,                              -- '日本人' '外国人' 等
  price_range        text,                              -- '90分15,000円～'
  opening_hours      text,
  homepage_url       text,
  source_url         text not null,                     -- https://men-esthe.jp/salon.php?id=1356
  details_synced_at  timestamptz,
  bookings_synced_at timestamptz,
  created_at         timestamptz default now() not null,
  updated_at         timestamptz default now() not null,
  deleted_at         timestamptz,
  unique(source, source_id)
);

create index idx_external_salons_source on external_salons(source);
create index idx_external_salons_homepage_url
  on external_salons(homepage_url)
  where homepage_url is not null;
create index idx_external_salons_details_synced_at
  on external_salons(details_synced_at nulls first);
create index idx_external_salons_bookings_synced_at
  on external_salons(bookings_synced_at nulls first)
  where homepage_url is not null and deleted_at is null;


-- ============================================================
-- external_salon_bookings
-- external_salon.homepage_url を訪問して検出した、予約システムへのリンク。
-- (site_name, shop_id) は我々の salons.(site_name, shop_id) と同じ命名規則。
-- 1サロンが複数の予約システムを併用するケースがあるので 1:N。
-- ============================================================
create table external_salon_bookings (
  id                 uuid primary key default gen_random_uuid(),
  external_salon_id  uuid not null references external_salons(id) on delete cascade,
  site_name          text not null,            -- 'caskan' | 'grow' | 'edc' | 'estama'
  shop_id            text not null,
  booking_url        text not null,
  created_at         timestamptz default now() not null,
  updated_at         timestamptz default now() not null,
  unique(external_salon_id, site_name, shop_id)
);

-- (site_name, shop_id) を起点に外部サロン → 我々の salons を引くインデックス。
create index idx_external_salon_bookings_site_shop
  on external_salon_bookings(site_name, shop_id);
create index idx_external_salon_bookings_external_salon_id
  on external_salon_bookings(external_salon_id);


-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================
create trigger trg_external_areas_updated_at
  before update on external_areas
  for each row execute function update_updated_at();

create trigger trg_external_salons_updated_at
  before update on external_salons
  for each row execute function update_updated_at();

create trigger trg_external_salon_bookings_updated_at
  before update on external_salon_bookings
  for each row execute function update_updated_at();


-- ============================================================
-- RLS
-- 参照テーブルなので誰でも select 可、書き込みは service_role のみ。
-- ============================================================
alter table external_areas          enable row level security;
alter table external_salons         enable row level security;
alter table external_salon_bookings enable row level security;

create policy "external_areas_select"
  on external_areas for select using (true);
create policy "external_salons_select"
  on external_salons for select using (true);
create policy "external_salon_bookings_select"
  on external_salon_bookings for select using (true);
