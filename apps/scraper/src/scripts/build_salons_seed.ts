/**
 * CSV (output/{site}.csv 系) を salons の冪等 INSERT 文に変換し、
 * `supabase/seed.sql` の salons ブロックを置換する。
 *
 * 入力 (2 系統):
 *   1. compact 形式 (3 列, 1 サイト 1 ファイル):
 *      - output/r.caskan.jp.csv
 *      - output/grow-appt.com.csv
 *      - output/esthe-datacenter.com.csv
 *      - output/estama.jp.csv
 *      ヘッダ: url, name, booking_url
 *
 *   2. candidates 形式 (5 列, men-esthe.jp 経由のクロール結果):
 *      - output/booking_external_candidates.csv
 *      ヘッダ: url, name, booking_domain, booking_url, anchor_text
 *      `filterDomain` でホスト名フィルタを掛けて 1 サイトずつ取り込む。
 *
 *   いずれも共通の意味付け:
 *     - url        = サロン公式サイトのトップ URL (= salons.homepage_url)
 *     - name       = サロン名 (= salons.name)
 *     - booking_url = 予約サイトの店舗 URL (= salons.url)
 *
 * 出力:
 *   - supabase/seed.sql の salons block を置換する (唯一の出力)
 *
 * 運用方針 (重要):
 *   - 本スクリプトは migration ファイルを書き出さない。
 *     `supabase/migrations/20260522000003_salons_seed.sql` は初回 bootstrap として
 *     既に本番 / staging に適用済みであり、`supabase db push` は適用済み migration の
 *     変更を再反映しないため、ここで migration を書き換える運用は破綻する。
 *   - salons の追加・更新は `supabase/seed.sql` に集約し、本番 / staging への反映は
 *     運用者が Supabase コンソール (SQL Editor) から seed.sql の salons ブロックを
 *     直接実行する形で行う (`on conflict (site_id, shop_id) do update` により冪等)。
 *   - ローカル / CI は `npx supabase db reset` で seed.sql が再投入されるため自動で追従する。
 *
 * 冪等性 (seed.sql 内の INSERT 単体としても成立):
 *   - (site_id, shop_id) 既存 → name / url / homepage_url を CSV 値で上書き
 *   - (site_id, shop_id) 新規 → INSERT
 *   - CSV に無い既存 salons → 触らない (別経路で追加されたものを尊重)
 *
 * shop_id は homepage_resolver.ts の PATTERNS を流用して booking_url から抽出する。
 * パターン二重管理を避けるため `extractBookings` を直接使う。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SiteName } from '@alimashita/shared';
import { extractBookings } from '../scrapers/menesthe/homepage_resolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/scraper/src/scripts → workspace root
const ROOT = resolve(__dirname, '../../../..');

/**
 * CSV ソース定義。
 *
 * - `format` 未指定（または `'compact'`）の場合は 3 列ヘッダ `url,name,booking_url` を期待する。
 * - `format: 'candidates'` の場合は 5 列ヘッダ `url,name,booking_domain,booking_url,anchor_text`
 *   を期待し、 `filterDomain` と一致する行のみ採用する。 men-esthe.jp 経由のクロール結果から
 *   特定の予約システム (例: e-yoyaku.jp) を抜き出す用途。
 */
type CsvSource =
  | {
      path: string;
      site: SiteName;
      format?: 'compact';
    }
  | {
      path: string;
      site: SiteName;
      format: 'candidates';
      filterDomain: string;
    };

const CSV_SOURCES: CsvSource[] = [
  { path: 'output/r.caskan.jp.csv', site: 'caskan' },
  { path: 'output/grow-appt.com.csv', site: 'grow' },
  { path: 'output/esthe-datacenter.com.csv', site: 'edc' },
  { path: 'output/estama.jp.csv', site: 'estama' },
  // e-yoyaku.jp 専用の compact CSV は存在しない。men-esthe.jp 由来の候補 CSV から
  // booking_domain でフィルタして取り込む (134 ユニーク shop_id 程度)。
  {
    path: 'output/booking_external_candidates.csv',
    site: 'eyoyaku',
    format: 'candidates',
    filterDomain: 'e-yoyaku.jp',
  },
];

interface CsvRow {
  url: string;
  name: string;
  booking_url: string;
}

interface SalonRow {
  site: SiteName;
  shop_id: string;
  name: string;
  homepage_url: string;
  booking_url: string;
}

/**
 * RFC 4180 風の最小 CSV パーサ。
 * フィールド内コンマ・ダブルクオート（"" でエスケープ）に加え、
 * クオート内の改行（CR/LF/CRLF）も同一レコードとして扱う。
 *
 * 戻り値は (行 → フィールド配列) の二次元配列。空レコードは除外する。
 */
function parseCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(cur);
    cur = '';
  };
  const pushRow = () => {
    pushField();
    // 完全に空のレコード (空行) は捨てる。データ行は最低でも url が入るので空にはならない想定。
    if (row.length > 1 || row[0] !== '') records.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const c = content[i]!;
    if (inQuotes) {
      if (c === '"' && content[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\r' && content[i + 1] === '\n') {
      pushRow();
      i++;
    } else if (c === '\n' || c === '\r') {
      pushRow();
    } else {
      cur += c;
    }
  }
  // 最終レコード (末尾改行なしのケース) を取り込む。
  if (cur.length > 0 || row.length > 0) pushRow();
  return records;
}

/**
 * compact 形式 (3 列): `url,name,booking_url`。
 */
function parseCsvCompact(content: string, label: string): CsvRow[] {
  const records = parseCsvRecords(content);
  const header = records.shift();
  if (!header || header.join(',') !== 'url,name,booking_url') {
    throw new Error(`Unexpected CSV header in ${label}: ${header?.join(',') ?? '<empty>'}`);
  }
  return records.map((fields, idx) => {
    if (fields.length !== 3) {
      throw new Error(`Bad CSV row ${idx + 2} in ${label}: ${fields.join('|')}`);
    }
    return { url: fields[0]!, name: fields[1]!, booking_url: fields[2]! };
  });
}

/**
 * candidates 形式 (5 列): `url,name,booking_domain,booking_url,anchor_text`。
 * `filterDomain` と完全一致する booking_domain の行のみを採用し、
 * (url, name, booking_url) の compact 形に正規化して返す。
 *
 * - url / name が空の行はスキップ (salons 必須カラム)。
 * - 同一 booking_url が anchor_text 違いで複数行に出るケースは下流の `dedup` で
 *   (site, shop_id) ベースに排除されるため、ここでは弾かない。
 * - anchor_text にクオートで囲まれた改行 (RFC 4180) が混じる行があり、
 *   `parseCsvRecords` 側がレコード境界を正しく解釈する。
 */
function parseCsvCandidates(
  content: string,
  label: string,
  filterDomain: string,
): CsvRow[] {
  const records = parseCsvRecords(content);
  const header = records.shift();
  if (
    !header ||
    header.join(',') !== 'url,name,booking_domain,booking_url,anchor_text'
  ) {
    throw new Error(`Unexpected CSV header in ${label}: ${header?.join(',') ?? '<empty>'}`);
  }
  const out: CsvRow[] = [];
  records.forEach((fields, idx) => {
    if (fields.length !== 5) {
      throw new Error(`Bad CSV row ${idx + 2} in ${label}: ${fields.join('|')}`);
    }
    const [url, name, bookingDomain, bookingUrl] = fields;
    if (bookingDomain !== filterDomain) return;
    if (!url || !name || !bookingUrl) {
      console.warn(`[${label}] Skip row ${idx + 2}: empty url/name/booking_url`);
      return;
    }
    out.push({ url, name, booking_url: bookingUrl });
  });
  return out;
}

function parseCsvForSource(source: CsvSource, content: string): CsvRow[] {
  if (source.format === 'candidates') {
    return parseCsvCandidates(content, source.path, source.filterDomain);
  }
  return parseCsvCompact(content, source.path);
}

/**
 * extractBookings は HTML 全体を想定した汎用関数だが、
 * URL 文字列 1 本を渡しても PATTERNS が global regex で 1 件マッチしてくる。
 * Site が一致するもののみ採用し、CSV のサイトと URL の整合性をここでも検証する。
 */
function extractShopId(booking_url: string, expectedSite: SiteName): string {
  const bookings = extractBookings(booking_url);
  const hit = bookings.find((b) => b.site_name === expectedSite);
  if (!hit) {
    throw new Error(
      `No ${expectedSite} shop_id extracted from booking_url: ${booking_url} ` +
        `(got: ${bookings.map((b) => `${b.site_name}:${b.shop_id}`).join(',') || 'none'})`,
    );
  }
  return hit.shop_id;
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function buildValuesClause(rows: SalonRow[]): string {
  return rows
    .map(
      (r) =>
        `  (${sqlString(r.site)}, ${sqlString(r.shop_id)}, ${sqlString(r.name)}, ${sqlString(r.booking_url)}, ${sqlString(r.homepage_url)})`,
    )
    .join(',\n');
}

/**
 * data migration / seed.sql で共通の SQL ブロックを組み立てる。
 *
 * site_id は sites.name 経由で解決する。
 *   - 本番では gen_random_uuid() で入っているので固定 UUID は使えない。
 *   - seed.sql でも sites は固定 UUID + name で挿入されているため name 経由でも問題ない。
 */
function buildSqlBlock(rows: SalonRow[]): string {
  const values = buildValuesClause(rows);
  return `insert into salons (site_id, shop_id, name, url, homepage_url)
select sm.id, v.shop_id, v.name, v.url, v.homepage_url
from (values
${values}
) as v(site_name, shop_id, name, url, homepage_url)
join sites sm on sm.name = v.site_name
on conflict (site_id, shop_id) do update set
  name         = excluded.name,
  url          = excluded.url,
  homepage_url = excluded.homepage_url,
  updated_at   = now()
where
  salons.name         is distinct from excluded.name
  or salons.url          is distinct from excluded.url
  or salons.homepage_url is distinct from excluded.homepage_url;
`;
}

/**
 * (site, shop_id) 重複を排除する。CSV 内のレコード重複（例: 同一 booking_url が
 * 2 行に出現）を吸収する。最初に出現したものを採用。
 */
function dedup(rows: SalonRow[]): SalonRow[] {
  const seen = new Map<string, SalonRow>();
  for (const r of rows) {
    const key = `${r.site}:${r.shop_id}`;
    if (seen.has(key)) {
      console.warn(`[dedup] Duplicate (${key}) dropped: ${r.name} / ${r.booking_url}`);
      continue;
    }
    seen.set(key, r);
  }
  return [...seen.values()];
}

function loadAllRows(): SalonRow[] {
  const all: SalonRow[] = [];
  for (const source of CSV_SOURCES) {
    const absPath = join(ROOT, source.path);
    const content = readFileSync(absPath, 'utf-8');
    const rows = parseCsvForSource(source, content);
    for (const r of rows) {
      const shop_id = extractShopId(r.booking_url, source.site);
      all.push({
        site: source.site,
        shop_id,
        name: r.name,
        homepage_url: r.url,
        booking_url: r.booking_url,
      });
    }
  }
  return all;
}

function writeSeed(rows: SalonRow[]): string {
  const seedPath = join(ROOT, 'supabase/seed.sql');
  const existing = readFileSync(seedPath, 'utf-8');

  // 既存 seed.sql は冒頭で sites を挿入し、その後 `-- salons` ブロックがファイル末尾まで続く構造。
  // `-- salons` を含むコメント枠の開始位置を見つけて、そこから末尾までを置換する。
  const salonsMarker = existing.indexOf('-- salons');
  if (salonsMarker < 0) {
    throw new Error('Could not find "-- salons" marker in seed.sql');
  }
  // "-- salons" 行の直前にある "-- =======" ヘッダ行の先頭を block 起点とする。
  const blockStart = existing.lastIndexOf('-- ===', salonsMarker);
  if (blockStart < 0) {
    throw new Error('Could not find "-- ===" header above salons marker in seed.sql');
  }

  const prefix = existing.slice(0, blockStart).trimEnd();
  // 本番 / staging は migration 経由ではなく、運用者が Supabase コンソール (SQL Editor)
  // でこの salons ブロックを直接実行することで反映する。
  // ローカル / CI は `npx supabase db reset` で seed.sql が再投入される。
  const salonsHeader = `-- ============================================================
-- salons
-- apps/scraper/src/scripts/build_salons_seed.ts で自動生成。手動編集禁止。
-- 本ブロックは output/*.csv から生成され、本プロジェクトの salons マスタの正となる。
--
-- 反映経路:
--   - ローカル / CI: \`npx supabase db reset\` で seed.sql 全体が投入される
--   - 本番 / staging: 運用者が Supabase コンソール (SQL Editor) からこの salons ブロックを
--                     コピペして実行する (on conflict (site_id, shop_id) do update で冪等)。
--                     \`npx supabase db push\` は適用済み migration の変更を反映しないため、
--                     salons の追加・更新を migration として書き直す運用は採らない。
-- ============================================================

`;
  const newSeed = `${prefix}\n\n\n${salonsHeader}${buildSqlBlock(rows)}`;
  writeFileSync(seedPath, newSeed);
  return seedPath;
}

function main(): void {
  const raw = loadAllRows();
  const deduped = dedup(raw);
  const sorted = deduped.sort(
    (a, b) => a.site.localeCompare(b.site) || a.shop_id.localeCompare(b.shop_id),
  );

  const seedPath = writeSeed(sorted);

  const bySite = new Map<SiteName, number>();
  for (const r of sorted) {
    bySite.set(r.site, (bySite.get(r.site) ?? 0) + 1);
  }
  console.log(`Wrote ${sorted.length} salons`);
  for (const [site, n] of bySite) {
    console.log(`  ${site}: ${n}`);
  }
  console.log(`  seed: ${seedPath}`);
  console.log(
    `\nNext: 本番 / staging に反映する場合は ${seedPath} の "-- salons" ブロックを\n` +
      `      Supabase コンソール (SQL Editor) から実行してください。\n` +
      `      ローカルは \`npx supabase db reset\` で自動投入されます。`,
  );
}

main();
