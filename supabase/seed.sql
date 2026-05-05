-- ============================================================
-- seed.sql
-- ローカル開発用の初期データ
-- supabase db reset のたびに自動で適用される
-- ============================================================


-- ============================================================
-- sites
-- ============================================================
insert into sites (id, name, base_url, search_query) values
  ('00000000-0000-0000-0000-000000000001', 'caskan',  'https://r.caskan.jp',   'site:r.caskan.jp'),
  ('00000000-0000-0000-0000-000000000002', 'grow',    'https://grow-appt.com', 'site:grow-appt.com');


-- ============================================================
-- salons
-- ============================================================
insert into salons (site_id, shop_id, name, url) values
  -- caskan
  (
    '00000000-0000-0000-0000-000000000001',
    'lien',
    'リアン恵比寿',
    'https://r.caskan.jp/lien/'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'gyokurou',
    '玉楼',
    'https://r.caskan.jp/gyokurou'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'salondeplumeria',
    'サロン・デ・プルメリア',
    'https://r.caskan.jp/salondeplumeria'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'elteras',
    'エルテラス',
    'https://r.caskan.jp/elteras'
  ),
  -- grow-appt.com
  (
    '00000000-0000-0000-0000-000000000002',
    'SyDEf0uZcu',
    '姫のエステ',
    'https://grow-appt.com/reserve?SID=SyDEf0uZcu'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '3RaerYSrCz',
    '六本木・麻布十番Carinna 〜カリナ〜',
    'https://grow-appt.com/reserve?SID=3RaerYSrCz'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'eXYrtf5c11',
    'やさしいお姉さんスパ',
    'https://grow-appt.com/reserve?SID=eXYrtf5c11'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'u15Vr2S7zV',
    'アロマモア',
    'https://grow-appt.com/reserve?SID=u15Vr2S7zV'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'RyqGG4NSpF',
    'Tokyo Panic 〜トウキョウパニック 〜',
    'https://grow-appt.com/reserve?SID=RyqGG4NSpF'
  );