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
  ('00000000-0000-0000-0000-000000000002', 'grow',    'https://grow-appt.com', 'site:grow-appt.com')
on conflict (id) do nothing;


-- ============================================================
-- salons
-- ============================================================
insert into salons (site_id, shop_id, name, url) values
  (
    '00000000-0000-0000-0000-000000000001',
    'aromae',
    'Aroma Elegance (アロマエレガンス)',
    'https://r.caskan.jp/aromae'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'celeb-bimajo',
    '東京セレブ美魔女倶楽部',
    'https://r.caskan.jp/celeb-bimajo'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'celebjukujo_meguro',
    '東京目黒高級セレブ熟女',
    'https://r.caskan.jp/celebjukujo_meguro'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'celesthine-aromage',
    'LUXEセレスティンアロマージュ',
    'https://r.caskan.jp/celesthine-aromage'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'clubmaria_ginza',
    'Club MARIA (クラブマリア)',
    'https://r.caskan.jp/clubmaria_ginza'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'diamondlily87',
    'Diamond Lily (ダイヤモンドリリー)',
    'https://r.caskan.jp/diamondlily87'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'ebis_ferrari',
    'FERRARI (フェラーリ)',
    'https://r.caskan.jp/ebis_ferrari'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'ebis_komadam',
    '恵比寿コマダム倶楽部',
    'https://r.caskan.jp/ebis_komadam'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'blue_diamond',
    'Blue Diamond (ブルーダイヤモンド)',
    'https://r.caskan.jp/blue_diamond'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'esthe_diablo',
    '高級メンズエステ DIABLO (ディアブロ)',
    'https://r.caskan.jp/esthe_diablo'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'lavieet',
    'Diamond La vie et (ダイヤモンドラヴィエ)',
    'https://r.caskan.jp/lavieet'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'matom',
    'GRANMATOM (グランマトム)',
    'https://r.caskan.jp/matom'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'menesmart',
    'MenEsMart (メンエスマート)',
    'https://r.caskan.jp/menesmart'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'mogami-esthe',
    'MOGAMI (最上)',
    'https://r.caskan.jp/mogami-esthe'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'okusamahote',
    '激安の殿堂 奥様ホーテ',
    'https://r.caskan.jp/okusamahote'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'relaxtokyo',
    'relax tokyo (リラックス東京)',
    'https://r.caskan.jp/relaxtokyo'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'shiroutohote',
    '激安の殿堂！素人ホーテ♡  学芸大学ルーム',
    'https://r.caskan.jp/shiroutohote'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aromaabc',
    'Aroma ABC',
    'https://r.caskan.jp/aromaabc'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'acro',
    'ACRO (アクロ)',
    'https://r.caskan.jp/acro'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aibyou',
    '愛猫',
    'https://r.caskan.jp/aibyou'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'anehime',
    'アネヒメ 旧フラッグシップアネックス',
    'https://r.caskan.jp/anehime'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'apexkichijoji',
    'APEX (エイペックス)',
    'https://r.caskan.jp/apexkichijoji'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aromaaria',
    'ARIA (アリア)',
    'https://r.caskan.jp/aromaaria'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aromairy',
    'AROMA AIRY (アロマエアリー)',
    'https://r.caskan.jp/aromairy'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aantique',
    'アロマアンティーク',
    'https://r.caskan.jp/aantique'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'belladonna',
    'Aroma Belladonna (アロマベラドンナ)',
    'https://r.caskan.jp/belladonna'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'chelone',
    'アロマケローネ 旧リベア葛西',
    'https://r.caskan.jp/chelone'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'giraffe',
    'アロマジラフ 旧アロマオリオ',
    'https://r.caskan.jp/giraffe'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aromaharmony',
    'AROMA HARMONY (アロマハーモニー)',
    'https://r.caskan.jp/aromaharmony'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aromajewels',
    'Aroma Jewels (アロマジュエルズ)',
    'https://r.caskan.jp/aromajewels/reserve'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'mireia',
    'アロマミレイア 旧AROMA KARIN (アロマカリン)',
    'https://r.caskan.jp/mireia'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'meidaiwoo',
    'Aroma Woo (アロマウー)',
    'https://r.caskan.jp/meidaiwoo'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'atlas',
    'アトラス',
    'https://r.caskan.jp/atlas'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'audience',
    'オーディエンス (AUDIENCE)',
    'https://r.caskan.jp/audience'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'bellee',
    'Belle É (ベルエ) 旧テラス',
    'https://r.caskan.jp/bellee'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'blackhole',
    'ブラックホール',
    'https://r.caskan.jp/blackhole'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'blackswan',
    'ブラックスワン',
    'https://r.caskan.jp/blackswan'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'cheryl',
    'シェリル札幌',
    'https://r.caskan.jp/cheryl'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'chocolat',
    'ショコラ 北海道',
    'https://r.caskan.jp/chocolat'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'cinderellaveil',
    'シンデレラベール',
    'https://r.caskan.jp/cinderellaveil'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'crystalspa',
    'クリスタルスパ 旧アイリス',
    'https://r.caskan.jp/crystalspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'melty_hachioji',
    'ダンディサロン 旧メルティ',
    'https://r.caskan.jp/melty_hachioji'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'daruma',
    '達磨のエステ',
    'https://r.caskan.jp/daruma'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'ekispa',
    '駅スパ',
    'https://r.caskan.jp/ekispa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'eldorado',
    'エルドラド 旧竜宮のエステ',
    'https://r.caskan.jp/eldorado'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'akabalice',
    'Alice (アリス) 赤羽',
    'https://r.caskan.jp/akabalice'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'angeaile',
    'Anjuaile (アンジュエール)',
    'https://r.caskan.jp/angeaile'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'blanc',
    'Blanc (ブロン)',
    'https://r.caskan.jp/blanc'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'bunnies',
    'バニーズ (Bunnie''s)',
    'https://r.caskan.jp/bunnies'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'dulcis',
    'ダルシス',
    'https://r.caskan.jp/dulcis'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'shinjukufirst',
    'First (ファースト) 新宿',
    'https://r.caskan.jp/shinjukufirst'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'natura',
    'NATURA (ナチュラ)',
    'https://r.caskan.jp/natura'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'nekonote',
    'ねこのて',
    'https://r.caskan.jp/nekonote'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'platinumtokyo',
    'PLATINUM TOKYO (プラチナム東京)',
    'https://r.caskan.jp/platinumtokyo'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'sakamichi',
    'エステの坂道',
    'https://r.caskan.jp/sakamichi'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'unknown',
    'Unknown (アンノウン)',
    'https://r.caskan.jp/unknown'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'elteras',
    'ELTERAS (エルテラス)',
    'https://r.caskan.jp/elteras'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aromaexe',
    'エグゼ (EXE) 本厚木',
    'https://r.caskan.jp/aromaexe'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'fortuna',
    'fortuna（フォルトゥナ）',
    'https://r.caskan.jp/fortuna'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'nigella',
    'ふたコのニゲラ',
    'https://r.caskan.jp/nigella'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'galaxynagoya',
    'Galaxy-NAGOYA (ギャラクシーナゴヤ)',
    'https://r.caskan.jp/galaxynagoya'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'galaxy',
    'ブラッドオレンジ',
    'https://r.caskan.jp/galaxy'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'galaxtky',
    'ギャラクシー 品川',
    'https://r.caskan.jp/galaxtky'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'godbless',
    'GOD BLESS (ゴッドブレス)',
    'https://r.caskan.jp/godbless'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'grancoco',
    'グランココ',
    'https://r.caskan.jp/grancoco'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'grandgaia',
    'グランドガイア（Grand Gaia）',
    'https://r.caskan.jp/grandgaia'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'greenapple',
    'グリーンアップル 旧レッドアイ',
    'https://r.caskan.jp/greenapple'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'grelax',
    'G/relax! (ジーリラックス)',
    'https://r.caskan.jp/grelax'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'gyokurou',
    '玉楼 (ぎょくろう)',
    'https://r.caskan.jp/gyokurou'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'hkiss',
    'ハピネスキス',
    'https://r.caskan.jp/hkiss'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'hawaiianv',
    'ハワイアンヴィレッジ',
    'https://r.caskan.jp/hawaiianv'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'hinoki',
    'Hinoki (檜)',
    'https://r.caskan.jp/hinoki'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'holeinone',
    'ホールインワン 相模大野',
    'https://r.caskan.jp/holeinone'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'honeyice',
    'ハニーアイス',
    'https://r.caskan.jp/honeyice'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'hotlatte',
    'ほっとラテ',
    'https://r.caskan.jp/hotlatte'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'hurricane',
    'HURRICANE (ハリケーン)',
    'https://r.caskan.jp/hurricane'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'iyasarenikoi',
    '癒されに恋 (癒恋)',
    'https://r.caskan.jp/iyasarenikoi'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'jsnishiarai',
    'ジュエリースパ',
    'https://r.caskan.jp/jsnishiarai'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'kingspa',
    'King Spa (キングスパ) 綱島',
    'https://r.caskan.jp/kingspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'kiwami',
    'KIWAMI TOKYO (旧極楽エステ)',
    'https://r.caskan.jp/kiwami'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'kyokasuigetsu',
    '鏡花水月',
    'https://r.caskan.jp/kyokasuigetsu'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'lemarge',
    'LE MARGE (ルマージュ熊本 大分)',
    'https://r.caskan.jp/lemarge'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'lihtways',
    'Lihtw＠ys (ライトウェイズ)',
    'https://r.caskan.jp/lihtways'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'loveland',
    '池袋LoveLand (ラブランド)',
    'https://r.caskan.jp/loveland'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'luceesthe',
    'ルーチェ (Luce) 大和',
    'https://r.caskan.jp/luceesthe'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'madonna',
    '池袋マドンナ',
    'https://r.caskan.jp/madonna'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'marvel',
    'マーヴェル (MARVEL)',
    'https://r.caskan.jp/marvel'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'moshimo',
    'moshimo... (もしも)',
    'https://r.caskan.jp/moshimo'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'cottonspa',
    'コットンスパ',
    'https://r.caskan.jp/cottonspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'class1st',
    'めんくら 旧メンズクラスファースト',
    'https://r.caskan.jp/class1st'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'meromerospa',
    'めろめろすぱ',
    'https://r.caskan.jp/meromerospa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'milkcandy',
    'みるくキャンディ',
    'https://r.caskan.jp/milkcandy'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '8136s',
    'ミストスパ',
    'https://r.caskan.jp/8136s'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'mistspa2',
    'ミストスパ',
    'https://r.caskan.jp/mistspa2'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'moisapporo',
    'モア (Moi)',
    'https://r.caskan.jp/moisapporo'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'mrspa',
    'ミセスパ (Mrs.pa)',
    'https://r.caskan.jp/mrspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'ichigopaf',
    'すとろべりーぱふぇ 旧ギルガメッシュナイト',
    'https://r.caskan.jp/ichigopaf'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'namex',
    'ナメックスパ 旧レッドリボン中野',
    'https://r.caskan.jp/namex'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'noelspa',
    'Noel (ノエル) 飯田橋',
    'https://r.caskan.jp/noelspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'noi',
    'ノイ',
    'https://r.caskan.jp/noi'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'oasis',
    'オアシス 旧シークレットルーム',
    'https://r.caskan.jp/oasis'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'offside',
    'オフサイド',
    'https://r.caskan.jp/offside'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'oilkingplus',
    'OIL KING (オイルキング)',
    'https://r.caskan.jp/oilkingplus'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'okubookasan',
    '大久保お義母さん',
    'https://r.caskan.jp/okubookasan'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'onepeace',
    'ワンピース',
    'https://r.caskan.jp/onepeace'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'onikando',
    'Oni Kando (オニ感度)',
    'https://r.caskan.jp/onikando'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'incarose',
    'Incarose (インカローズ)',
    'https://r.caskan.jp/incarose'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'palantir',
    'Palantir (パランティア)',
    'https://r.caskan.jp/palantir'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'pixiespa',
    'ピクシースパ',
    'https://r.caskan.jp/pixiespa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'potechi',
    'ぽてち',
    'https://r.caskan.jp/potechi'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'pranaspa',
    'PRANA SPA (プラナスパ) 本店',
    'https://r.caskan.jp/pranaspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'printempsotsuka',
    'PRINTEMPS (プランタン大塚)',
    'https://r.caskan.jp/printempsotsuka'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'punispa',
    'Puni Spa (ぷにスパ)',
    'https://r.caskan.jp/punispa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'amaterasy',
    'ラビットスパ 神奈川',
    'https://r.caskan.jp/amaterasy'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'rstachikawa',
    'ラビットスパ 立川店',
    'https://r.caskan.jp/rstachikawa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'rrkoshigaya',
    'レッドリボン越谷',
    'https://r.caskan.jp/rrkoshigaya'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'rrmaebashi',
    'レッドリボン 前橋',
    'https://r.caskan.jp/rrmaebashi'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'rrmotoyawata',
    'レッドリボン本八幡',
    'https://r.caskan.jp/rrmotoyawata'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'relaxstar',
    'RelaxStar (リラックススター)',
    'https://r.caskan.jp/relaxstar'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'remis',
    'ランス (REMIS) 旧ニルス',
    'https://r.caskan.jp/remis'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'ririmspa',
    'りりむすぱ',
    'https://r.caskan.jp/ririmspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'ryusei',
    '流星のエステ 旧爆裂スパ',
    'https://r.caskan.jp/ryusei'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'sagaps',
    'サガ プライベートスパ',
    'https://r.caskan.jp/sagaps'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'diosa',
    'サロンディライト 旧スパディオーサ',
    'https://r.caskan.jp/diosa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'anue',
    'アヌエ',
    'https://r.caskan.jp/anue'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'salondeplumeria',
    'Salonde Plumeria (サロンドプルメリア)',
    'https://r.caskan.jp/salondeplumeria'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'saudade',
    'サウダージ 旧リセット',
    'https://r.caskan.jp/saudade'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'seaspa82',
    'シースパ',
    'https://r.caskan.jp/seaspa82'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'secretcafe',
    'シークレットカフェ',
    'https://r.caskan.jp/secretcafe'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'secretmoment',
    'シークレットモーメント',
    'https://r.caskan.jp/secretmoment'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'bellelily',
    'ベルリリー (Belle Lily)',
    'https://r.caskan.jp/bellelily'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'sollevante',
    'Sol Levante (ソルレヴァンテ)',
    'https://r.caskan.jp/sollevante'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'spad',
    'D-SPA (ディースパ)',
    'https://r.caskan.jp/spad'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'urekaji',
    '熟れた果実',
    'https://r.caskan.jp/urekaji'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'supernova',
    'スーパーノバ 武蔵小杉',
    'https://r.caskan.jp/supernova'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'michies',
    '道のエステ',
    'https://r.caskan.jp/michies'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'tequila',
    'テキーラ',
    'https://r.caskan.jp/tequila'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'bestmore',
    'ザ ベストアンドモア',
    'https://r.caskan.jp/bestmore'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'theblanc',
    'THE BLANC (ザブラン)',
    'https://r.caskan.jp/theblanc'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'thesilhouette',
    'ザ・シルエット 旧アロマプリン',
    'https://r.caskan.jp/thesilhouette'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'taudition',
    '所沢オーディション 旧レモン',
    'https://r.caskan.jp/taudition'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'machidatiara',
    'Tiara (ティアラ) 町田',
    'https://r.caskan.jp/machidatiara'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'tokyopla',
    'トキョプラ 旧ティープラス 新宿',
    'https://r.caskan.jp/tokyopla'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'unicon',
    'ユニコン 旧ウルレア巣鴨',
    'https://r.caskan.jp/unicon'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'unisonspa',
    'ユニゾンスパ',
    'https://r.caskan.jp/unisonspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'velours',
    'VELOURS (ヴルール)',
    'https://r.caskan.jp/velours'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'vinos',
    'VINOS (ビノス)',
    'https://r.caskan.jp/vinos'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'willbe',
    'ウィルビー',
    'https://r.caskan.jp/willbe'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'aromantic',
    'AROMAntic (アロマンティック)',
    'https://r.caskan.jp/aromantic'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'felix',
    'フェリックス',
    'https://r.caskan.jp/felix'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'frejya-kyoto',
    'Frejya (フレイヤ)',
    'https://r.caskan.jp/frejya-kyoto'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'girigirimucho',
    'ギリギリムーチョ',
    'https://r.caskan.jp/girigirimucho'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'jdspa',
    'JDスパ (女子大生エステ)',
    'https://r.caskan.jp/jdspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'lien',
    'lien (リアン)',
    'https://r.caskan.jp/lien/'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'livspa',
    'LIVSPA (リブスパ)',
    'https://r.caskan.jp/livspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'msdolce',
    'DOLCE SPA (ドルチェスパ) 北千住',
    'https://r.caskan.jp/msdolce'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'mulala',
    'MULALA (ムララ)',
    'https://r.caskan.jp/mulala'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'naturalspa',
    'Natural SPA (ナチュラルスパ) 荻窪',
    'https://r.caskan.jp/naturalspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'noaspa',
    'NOA (ノア) 神奈川',
    'https://r.caskan.jp/noaspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'princeosaka',
    'PRINCE (プリンス)',
    'https://r.caskan.jp/princeosaka'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'rheaspa',
    'RHEA SPA (レアスパ)',
    'https://r.caskan.jp/rheaspa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'sparich',
    'THE SPA Rich (ザスパリッチ)',
    'https://r.caskan.jp/sparich'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'yuimrs',
    '結 (YUI) ミセス邸',
    'https://r.caskan.jp/yuimrs'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'yukoku',
    '癒刻 (ゆこく)',
    'https://r.caskan.jp/yukoku'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'yunispa',
    'Yuni Spa (ユニスパ)',
    'https://r.caskan.jp/yunispa'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'zenryoku1209',
    '全力エステ 仙台',
    'https://r.caskan.jp/zenryoku1209'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'uyauGhmQ1S',
    'バリアーノ (BARIANO) 所沢店',
    'https://grow-appt.com/reserve/uyauGhmQ1S/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'ksAvSVaSLc',
    'Fromage (フロマージュ)',
    'https://grow-appt.com/reserve/ksAvSVaSLc/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'ZQapJ52Ebm',
    'ジェントルマンズスパ国分寺',
    'https://grow-appt.com/reserve/ZQapJ52Ebm/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'WVLaM2s2vC',
    'LINDA SPA (リンダスパ)',
    'https://grow-appt.com/reserve/WVLaM2s2vC/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'zSDnZkuDGn',
    'Pure White (ピュアホワイト)',
    'https://grow-appt.com/reserve/zSDnZkuDGn/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'WByC0Hmt2r',
    'Sweet (スウィート) 浜松',
    'https://grow-appt.com/reserve/WByC0Hmt2r/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'tzvYyx2fyC',
    'RED (レッド)',
    'https://grow-appt.com/reserve/tzvYyx2fyC/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'cy7JNnfZVc',
    'AROMA MAISON  (アロマメゾン)',
    'https://grow-appt.com/reserve/cy7JNnfZVc/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'kU39sECwnD',
    'Body Fresh (ボディフレッシュ)',
    'https://grow-appt.com/reserve/kU39sECwnD/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'KARLn77gS1',
    'fees des fleurages (フェデフルラージュ)',
    'https://grow-appt.com/reserve/KARLn77gS1/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'db39QC2Es3',
    '神のエステ 葛西店',
    'https://grow-appt.com/reserve/db39QC2Es3/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'yAZx6YvnGy',
    'LEGEND FUCHU HANARE (レジェンド府中ハナレ)',
    'https://grow-appt.com/reserve/yAZx6YvnGy/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'kxug2nDAbF',
    'LEGEND ひばりヶ丘 (レジェンド)',
    'https://grow-appt.com/reserve/kxug2nDAbF/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'ZkLp3451LD',
    'MoMo Spa (モモスパ)',
    'https://grow-appt.com/reserve/ZkLp3451LD/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'p72hnfWHZB',
    'Relaxation Spa ROSA 姫路 (リラクゼーションスパロッサ)',
    'https://grow-appt.com/reserve/p72hnfWHZB/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'g1JTusrTQe',
    '6.5℃ (ロクドゴブ)',
    'https://grow-appt.com/reserve/g1JTusrTQe/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'EvHpTHGL0R',
    'ナナツボシ',
    'https://grow-appt.com/reserve/EvHpTHGL0R/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'dL0gtv3TWw',
    'エーペックス 上尾店',
    'https://grow-appt.com/reserve/dL0gtv3TWw/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '2P5Y0XTvLe',
    'AROMA chocolate (アロマショコラ)',
    'https://grow-appt.com/reserve/2P5Y0XTvLe/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'pT2XTNpW6m',
    '雅 Miyabi (ミヤビ)',
    'https://grow-appt.com/reserve/pT2XTNpW6m/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'yb3bgECfAN',
    'NO BRAND (ノーブランド)',
    'https://grow-appt.com/reserve/yb3bgECfAN/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'u15Vr2S7zV',
    'AROMA more (アロマモア)',
    'https://grow-appt.com/reserve/u15Vr2S7zV/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Sqa29YD5cQ',
    'aroma vicca (アロマヴィッカ)',
    'https://grow-appt.com/reserve/Sqa29YD5cQ/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'G462VsaFCX',
    'Assouplir ANNEX (アスプリールアネックス)',
    'https://grow-appt.com/reserve/G462VsaFCX/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'rgTVMPPSEE',
    'アスプリールプレミアタマチ',
    'https://grow-appt.com/reserve/rgTVMPPSEE/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'htM7UDzPHC',
    'Assouplir (アスプリール) 秋葉原',
    'https://grow-appt.com/reserve/htM7UDzPHC/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'RPZChtrWhG',
    'AZUL (アズール)',
    'https://grow-appt.com/reserve/RPZChtrWhG/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'V4rSpMMUWp',
    'バカラ 山口',
    'https://grow-appt.com/reserve/V4rSpMMUWp/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'csu1Dx57Q4',
    'ベイサイドリラックス 旧アロマモンステラ',
    'https://grow-appt.com/reserve/csu1Dx57Q4/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '34u9JdnCtW',
    'BUNNYS TOKYO (バニーズトウキョウ)',
    'https://grow-appt.com/reserve/34u9JdnCtW/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'sAvD2E2gPd',
    'CAMERON (キャメロン)',
    'https://grow-appt.com/reserve/sAvD2E2gPd/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '3RaerYSrCz',
    'Carinna カリナ 旧ハイアット',
    'https://grow-appt.com/reserve/3RaerYSrCz/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '7PP7thzgXK',
    'シュシュ (chou chou) 旧オルオルスパ',
    'https://grow-appt.com/reserve/7PP7thzgXK/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'VQyeuyzwTr',
    'CREST SPA TOKYO (クレストスパ)',
    'https://grow-appt.com/reserve/VQyeuyzwTr/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'T4QX0spR2s',
    'EDEL AZABU (エデル麻布)',
    'https://grow-appt.com/reserve/T4QX0spR2s/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'yagWw39PU6',
    'エデンの園 川口',
    'https://grow-appt.com/reserve/yagWw39PU6/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '9YfMUrH3Py',
    '超E-spa (超イースパ)',
    'https://grow-appt.com/reserve/9YfMUrH3Py/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'A6y9dhNdQ1',
    'Apex (エーペックス)',
    'https://grow-appt.com/reserve/A6y9dhNdQ1/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'LwrKZjs1jp',
    'フィーバー',
    'https://grow-appt.com/reserve?SID=LwrKZjs1jp'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    's67pqC3uzE',
    '女神の手',
    'https://grow-appt.com/reserve/s67pqC3uzE/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'waTTJrFekQ',
    'Lunedia (ルナディア)',
    'https://grow-appt.com/reserve/waTTJrFekQ/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'TdFguhNM27',
    'LYNX (リンクス) 五反田店',
    'https://grow-appt.com/reserve/TdFguhNM27/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'aD3RNdpVDx',
    'ぷろぽーしょん',
    'https://grow-appt.com/reserve/aD3RNdpVDx/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'kW7MXa4aNy',
    'Rabona (ラボーナ)',
    'https://grow-appt.com/reserve/kW7MXa4aNy/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'HA3hx7KTdv',
    'Special Grade (スペシャルグレード)',
    'https://grow-appt.com/reserve/HA3hx7KTdv/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'A9hK2TXx6z',
    'エクシア (EXCIA)',
    'https://grow-appt.com/reserve/A9hK2TXx6z/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'LkkmkJDs0T',
    'カノネコ 池袋',
    'https://grow-appt.com/reserve/LkkmkJDs0T/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '1uEKcHvFr3',
    'AROMA ESPOIR (アロマエスポワール)',
    'https://grow-appt.com/reserve/1uEKcHvFr3/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'gg6cHS1QmZ',
    'ゴールデン（GOLDEN） 旧ガーデン',
    'https://grow-appt.com/reserve/gg6cHS1QmZ/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'WhNL9pEr9b',
    'ダイヤモンド',
    'https://grow-appt.com/reserve/WhNL9pEr9b/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'bBBH4nCgPW',
    '花うた 旧Fururi (ふるり)',
    'https://grow-appt.com/reserve/bBBH4nCgPW/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'ApGJep9m1u',
    'Heart (ハート) 福山',
    'https://grow-appt.com/reserve/ApGJep9m1u/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '6qERkuwE5M',
    'HIGH GRANDE (ハイグランデ)',
    'https://grow-appt.com/reserve/6qERkuwE5M/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '5ABMgtRZMk',
    'Lemonade (レモネード) 姫路店',
    'https://grow-appt.com/reserve/5ABMgtRZMk/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '64YDcmFXTW',
    '色恋倶楽部',
    'https://grow-appt.com/reserve/64YDcmFXTW/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Gukr49CExN',
    'JEAN ROBIN (ジャンロビン)',
    'https://grow-appt.com/reserve/Gukr49CExN/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'svScx4NUDy',
    'KAGUYA (カグヤ) ～星乃幻想～',
    'https://grow-appt.com/reserve/svScx4NUDy/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'g7XdfMCHVv',
    '海癒樂',
    'https://grow-appt.com/reserve/g7XdfMCHVv/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'xZfRSkbsQQ',
    'lemonade (レモネード) 神戸',
    'https://grow-appt.com/reserve/xZfRSkbsQQ/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'EaX9TyYUDh',
    'KOBE QUEEN (コウベクイーン)',
    'https://grow-appt.com/reserve/EaX9TyYUDh/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'bnyEtWAnrW',
    'ララスパ (LaLaスパ)',
    'https://grow-appt.com/reserve/bnyEtWAnrW/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'SAguqgnDES',
    'Aroma LaLuna (アロマラルーナ)',
    'https://grow-appt.com/reserve/SAguqgnDES/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'HSANFbDcrq',
    'Love it (ラヴィット)',
    'https://grow-appt.com/reserve/HSANFbDcrq/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'xhWgUeZFWm',
    'ルナラテ',
    'https://grow-appt.com/reserve/xhWgUeZFWm/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '4TATKM1Bcq',
    'MADAM B (マダムビー)',
    'https://grow-appt.com/reserve/4TATKM1Bcq/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'qzXzZcEZHd',
    'Marigold (マリーゴールド)',
    'https://grow-appt.com/reserve/qzXzZcEZHd/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'UheAT57Uea',
    'Esthe Spa (エステスパ)',
    'https://grow-appt.com/reserve/UheAT57Uea/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'vNd9mXUyDX',
    'GRACE (グレイス) 成増',
    'https://grow-appt.com/reserve/vNd9mXUyDX/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'BEfgWdyNTN',
    '響 (HIBIKI) 埼玉',
    'https://grow-appt.com/reserve/BEfgWdyNTN/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '9feRunc3aZ',
    'Luna (ルナ) 鹿児島',
    'https://grow-appt.com/reserve/9feRunc3aZ/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'wPSUeZUdk2',
    'Mimi Spa (ミミスパ) 銀座',
    'https://grow-appt.com/reserve/wPSUeZUdk2/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'FUqpG0nWv7',
    'Mint Club (ミントクラブ)',
    'https://grow-appt.com/reserve/FUqpG0nWv7/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '01K6C65RPBJXKTQ2Y45QWCWVTT',
    'モンロー',
    'https://grow-appt.com/reserve?SID=01K6C65RPBJXKTQ2Y45QWCWVTT'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '0XQW6dpr0N',
    '万華鏡',
    'https://grow-appt.com/reserve/0XQW6dpr0N/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Nd1Mw6J34z',
    'niigata men''s aroma allure (アリュール)',
    'https://grow-appt.com/reserve/Nd1Mw6J34z/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'nUQxyRd3WK',
    'ノヴァ',
    'https://grow-appt.com/reserve/nUQxyRd3WK/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'oST3yCPVXn',
    '猫猫猫 (にゃんにゃんにゃん)',
    'https://grow-appt.com/reserve/oST3yCPVXn'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'CgAMMgPmEp',
    'Queendom (クイーンダム)',
    'https://grow-appt.com/reserve/CgAMMgPmEp/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'gT9vMuTKcG',
    'オンリー (ONLY)',
    'https://grow-appt.com/reserve/gT9vMuTKcG/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Nfw0qBffxS',
    'ORION SPA (オリオンスパ)',
    'https://grow-appt.com/reserve/Nfw0qBffxS/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '4FfeG2Nd1c',
    '王様の気持ち',
    'https://grow-appt.com/reserve/4FfeG2Nd1c/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'CZZmcwaRvz',
    '大人のネバーランド',
    'https://grow-appt.com/reserve/CZZmcwaRvz/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '6076wZxqhK',
    'Pearl (パール)',
    'https://grow-appt.com/reserve/6076wZxqhK/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '01KPMSWKKT7JVVB0C673NWKQM4',
    'Pepe Spa (ペペスパ)',
    'https://grow-appt.com/reserve/01KPMSWKKT7JVVB0C673NWKQM4'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'vxs7meyxAW',
    'QUEEN''S COLLECTION (クイーンズコレクション)',
    'https://grow-appt.com/reserve/vxs7meyxAW/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'VkWM0xbx4J',
    'リッチテラス札幌',
    'https://grow-appt.com/reserve/VkWM0xbx4J/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '1eAF0f33ke',
    'ロゼアナ 旧メルティ',
    'https://grow-appt.com/reserve/1eAF0f33ke/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '01K806B50EQWHNNSS72QCM5AME',
    'ROYAL SPA (ロイヤルスパ) 町田',
    'https://grow-appt.com/reserve/01K806B50EQWHNNSS72QCM5AME'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'xP3A2fp1ZR',
    '竜宮城',
    'https://grow-appt.com/reserve/xP3A2fp1ZR/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'KwseLTJzDf',
    'SALON BLANCA (サロンブランカ)',
    'https://grow-appt.com/reserve/KwseLTJzDf/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '6N5BGRVwfa',
    'Sweet ～berta～ (スウィートベルタ) 静岡',
    'https://grow-appt.com/reserve/6N5BGRVwfa/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'D7kadvKVCY',
    'Sweet～crea～ (スウィートクレア)',
    'https://grow-appt.com/reserve/D7kadvKVCY/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '01K9XDW69G8RNBRZ5WRCMQ0GNX',
    'スウィート学園 (Sweet学園)',
    'https://grow-appt.com/reserve/review?SID=01K9XDW69G8RNBRZ5WRCMQ0GNX'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '3CwfyEXRvL',
    'Sweet Mist (スイートミスト)',
    'https://grow-appt.com/reserve/3CwfyEXRvL/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'VaBK7b2Het',
    'Comfortbois (コンフォールボア)',
    'https://grow-appt.com/reserve/VaBK7b2Het/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'yCwP9dZ6gU',
    '大人の天界学園 秋葉原',
    'https://grow-appt.com/reserve/yCwP9dZ6gU/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'AvYkN415u5',
    '天界のスパ 立川店',
    'https://grow-appt.com/reserve/AvYkN415u5/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'mb55g52nD2',
    'THE ESTHE FUKUOKA (ザ・エステフクオカ)',
    'https://grow-appt.com/reserve/mb55g52nD2/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '3dpbT6CaSX',
    'THE ESTHE AZABU (ザ・エステアザブ)',
    'https://grow-appt.com/reserve/3dpbT6CaSX/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Adw9hx0Grc',
    'THE HALF（ザ・ハーフ）',
    'https://grow-appt.com/reserve/Adw9hx0Grc/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '1d1Agay0Fv',
    'THE PREMIUM SPA (ザ・プレミアムスパ)',
    'https://grow-appt.com/reserve/1d1Agay0Fv/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'r3fWEZTvPx',
    'ティアナ (Ti.ana)',
    'https://grow-appt.com/reserve/r3fWEZTvPx/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'RyqGG4NSpF',
    'Tokyo Panic (トウキョウパニック)',
    'https://grow-appt.com/reserve/RyqGG4NSpF/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'u1FXKBCnZ3',
    '紡戯',
    'https://grow-appt.com/reserve/u1FXKBCnZ3/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'sbUU77ypGT',
    'うさぎちゃんスパ',
    'https://grow-appt.com/reserve/sbUU77ypGT/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'KeYrLXv3W2',
    'W SPA (ダブリュースパ)',
    'https://grow-appt.com/reserve/KeYrLXv3W2/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'TZc3xdbgUB',
    'ANAICHI (アナイチ)',
    'https://grow-appt.com/reserve/TZc3xdbgUB/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '6T9ah4Afzy',
    'Anela spa (アネラスパ) 川越',
    'https://grow-appt.com/reserve/6T9ah4Afzy/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'ULFwQ1BMMu',
    'Aroma Blanca (アロマブランカ)',
    'https://grow-appt.com/reserve/ULFwQ1BMMu/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'kmVqft1ByK',
    'Aromaria (アロマリア) 北海道',
    'https://grow-appt.com/reserve/kmVqft1ByK/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'sRkCx1r1Ex',
    'Calme (カルム) 埼玉',
    'https://grow-appt.com/reserve/sRkCx1r1Ex/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '0KzPpuqswt',
    'キュンキュンスパ',
    'https://grow-appt.com/reserve/0KzPpuqswt/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'svYwzCGPtk',
    'クリームソーダ',
    'https://grow-appt.com/reserve/svYwzCGPtk/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'nEr9bx2crY',
    '2nd キュンキュンスパ',
    'https://grow-appt.com/reserve/nEr9bx2crY/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'u4Uqy3NhVv',
    'LYNX (リンクス) 小岩店',
    'https://grow-appt.com/reserve/u4Uqy3NhVv/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '0YM3Aam7xL',
    'エステの王様',
    'https://grow-appt.com/reserve/0YM3Aam7xL/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'A11cdLH25L',
    'ぐらどるスパ',
    'https://grow-appt.com/reserve/A11cdLH25L/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '6BZN9sLEPP',
    'glow (グロウ)',
    'https://grow-appt.com/reserve/6BZN9sLEPP/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'SyDEf0uZcu',
    '姫のエステ',
    'https://grow-appt.com/reserve/SyDEf0uZcu/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'hRZwTfwrCy',
    'Hot Land (ホットランド)',
    'https://grow-appt.com/reserve/hRZwTfwrCy/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'mAQFLypace',
    '自由の女神',
    'https://grow-appt.com/reserve/mAQFLypace/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Wxq5mYELyF',
    'PETIT COQUETTE(プティ・コケット)',
    'https://grow-appt.com/reserve/Wxq5mYELyF/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'WuZRBQJWZu',
    '神のエステ 千葉店',
    'https://grow-appt.com/reserve/WuZRBQJWZu/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '3dLbHEXgN1',
    '神のエステ 日暮里・鶯谷',
    'https://grow-appt.com/reserve/3dLbHEXgN1/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'XUs4YQuXyE',
    '神のエステ 船橋店',
    'https://grow-appt.com/reserve/XUs4YQuXyE/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'K5rdSx0T2P',
    'レジェンド目白 エトワール',
    'https://grow-appt.com/reserve/K5rdSx0T2P/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'CqR3AUvKgD',
    'LEGEND MITAKA AURORA (レジェンドミタカオーロラ)',
    'https://grow-appt.com/reserve/CqR3AUvKgD/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'c3TyDe5pBy',
    'Maison NOIR (メゾンノアール)',
    'https://grow-appt.com/reserve/c3TyDe5pBy/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'sL3hWkn6pV',
    'メンズエステが好きすぎて・・・',
    'https://grow-appt.com/reserve/sL3hWkn6pV/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'b72NHRPLZ7',
    'OTONA TIC (オトナチック)',
    'https://grow-appt.com/reserve/b72NHRPLZ7/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '6CtDNMv0XV',
    'ar Tokyo (アールトウキョウ秋葉原)',
    'https://grow-appt.com/reserve/6CtDNMv0XV/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '01KH0WKS6SQ4PBJYCR1X0A5Z2H',
    'クジャク 旧ルガール東京',
    'https://grow-appt.com/reserve/01KH0WKS6SQ4PBJYCR1X0A5Z2H'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '73DqeSyCPu',
    'なでしこ',
    'https://grow-appt.com/reserve/73DqeSyCPu/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'NNwyghVASu',
    'AGENDA (アジェンダ)',
    'https://grow-appt.com/reserve/NNwyghVASu/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'NCLm5GzS6T',
    'Syalulu (シャルル) 府中',
    'https://grow-appt.com/reserve?SID=NCLm5GzS6T'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '01KA03PNHDK50WRAQB6N8KWTY7',
    '天界のスパ 明大前',
    'https://grow-appt.com/reserve/01KA03PNHDK50WRAQB6N8KWTY7'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Ry0hDtDkR1',
    '天界のスパ 北千住',
    'https://grow-appt.com/reserve/Ry0hDtDkR1/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'T2eWJFexvx',
    '天界のスパ 中目黒',
    'https://grow-appt.com/reserve/T2eWJFexvx/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'McNs3QGh0s',
    'TIGER GATE (タイガーゲート)虎ノ門',
    'https://grow-appt.com/reserve/McNs3QGh0s/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'CQ1SAPtRGd',
    'Tiger Lilly (タイガーリリー)',
    'https://grow-appt.com/reserve/CQ1SAPtRGd/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'eXYrtf5c11',
    'やさしいお姉さんスパ',
    'https://grow-appt.com/reserve/eXYrtf5c11/'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'CC3EE9TynW',
    'YSY 旧OGT',
    'https://grow-appt.com/reserve/CC3EE9TynW/'
  )
on conflict (site_id, shop_id) do nothing;
