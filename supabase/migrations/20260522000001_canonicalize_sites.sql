-- ============================================================
-- Migration: 20260522000001_canonicalize_sites.sql
-- Description:
--   sites テーブルを canonical 化する。
--
--   背景:
--     - 元 migration 20260426000002 で caskan / grow は gen_random_uuid() で投入された。
--     - その後の運用過程で 固定 UUID (00000000-0000-0000-0000-00000000000{1,2})
--       版が手動 or 別経路で本番に追加され、name='caskan'/'grow' が 2 行ずつ
--       存在する状態になった。
--     - salons は固定 UUID 版を参照しているため、gen_random_uuid() 版は孤立行
--       (salons_cnt = 0)。
--     - edc は migration では未投入で固定 UUID 版が手動投入されている。estama は
--       20260512000001 で固定 UUID で投入済み。
--
--   本 migration の処理:
--     1. 孤立した gen_random_uuid() 版 caskan / grow を削除する (salons FK は
--        固定 UUID 側を参照しているので影響しない)。
--     2. 念のため canonical な固定 UUID 4 行を idempotent に upsert する。これに
--        より edc / estama が未投入のローカル環境 / 将来環境でも整合する。
--     3. sites.name に UNIQUE 制約を追加し、以降の重複投入を不能にする。
--
--   影響:
--     - 本番: gen_random_uuid 版 caskan / grow 2 行を削除。以降 sites.name が
--       決定的に id に解決される。
--     - ローカル / CI: db reset 後の seed.sql 適用までこの migration が先行する
--       ため、seed.sql の sites block (固定 UUID, on conflict (id) do nothing) は
--       何もせず通過し、結果として 4 行に揃う。
-- ============================================================


-- ============================================================
-- 1. 孤立した gen_random_uuid 版 caskan / grow を削除
--    salons FK は固定 UUID 版を指すので、孤立行のみが対象。
-- ============================================================
delete from sites
 where name = 'caskan'
   and id <> '00000000-0000-0000-0000-000000000001';

delete from sites
 where name = 'grow'
   and id <> '00000000-0000-0000-0000-000000000002';


-- ============================================================
-- 2. canonical な sites 4 行を idempotent に upsert
--    本番では既に存在するため no-op、ローカル / 新規環境向けの保険。
-- ============================================================
insert into sites (id, name, base_url, search_query) values
  ('00000000-0000-0000-0000-000000000001', 'caskan', 'https://r.caskan.jp',          'site:r.caskan.jp'),
  ('00000000-0000-0000-0000-000000000002', 'grow',   'https://grow-appt.com',        'site:grow-appt.com'),
  ('00000000-0000-0000-0000-000000000003', 'edc',    'https://esthe-datacenter.com', 'site:esthe-datacenter.com'),
  ('00000000-0000-0000-0000-000000000004', 'estama', 'https://estama.jp',            'site:estama.jp')
on conflict (id) do nothing;


-- ============================================================
-- 3. sites.name に UNIQUE 制約を追加
--    意味的に unique なはずだが元の DDL で抜けていたため、ここで補正する。
--    以降の seed / migration / 手動投入で name 衝突が即座に検知される。
-- ============================================================
alter table sites
  add constraint sites_name_key unique (name);
