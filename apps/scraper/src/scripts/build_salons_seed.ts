/**
 * CSV (output/{site}.csv) を salons の冪等 data migration / seed.sql に変換する。
 *
 * 入力:
 *   - output/r.caskan.jp.csv
 *   - output/grow-appt.com.csv
 *   - output/esthe-datacenter.com.csv
 *   - output/estama.jp.csv
 *   CSV ヘッダ: url, name, booking_url
 *     - url        = サロン公式サイトのトップ URL (= salons.homepage_url)
 *     - name       = サロン名 (= salons.name)
 *     - booking_url = 予約サイトの店舗 URL (= salons.url)
 *
 * 出力:
 *   - supabase/migrations/20260522000003_salons_seed.sql
 *     本番 / staging / local 全環境への INSERT ... ON CONFLICT DO UPDATE
 *   - supabase/seed.sql の salons block を migration と同内容で置換
 *
 * 冪等性:
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

interface CsvSource {
  path: string;
  site: SiteName;
}

const CSV_SOURCES: CsvSource[] = [
  { path: 'output/r.caskan.jp.csv', site: 'caskan' },
  { path: 'output/grow-appt.com.csv', site: 'grow' },
  { path: 'output/esthe-datacenter.com.csv', site: 'edc' },
  { path: 'output/estama.jp.csv', site: 'estama' },
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
 * RFC 4180 風の最小 CSV 行パーサ。
 * フィールド内コンマ・ダブルクオート（"" でエスケープ）に対応する。
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  result.push(cur);
  return result;
}

function parseCsv(content: string, label: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines.shift();
  if (header !== 'url,name,booking_url') {
    throw new Error(`Unexpected CSV header in ${label}: ${header}`);
  }
  return lines.map((line, idx) => {
    const fields = splitCsvLine(line);
    if (fields.length !== 3) {
      throw new Error(`Bad CSV row ${idx + 2} in ${label}: ${line}`);
    }
    return { url: fields[0]!, name: fields[1]!, booking_url: fields[2]! };
  });
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
  for (const { path, site } of CSV_SOURCES) {
    const absPath = join(ROOT, path);
    const content = readFileSync(absPath, 'utf-8');
    const rows = parseCsv(content, path);
    for (const r of rows) {
      const shop_id = extractShopId(r.booking_url, site);
      all.push({
        site,
        shop_id,
        name: r.name,
        homepage_url: r.url,
        booking_url: r.booking_url,
      });
    }
  }
  return all;
}

function writeMigration(rows: SalonRow[]): string {
  const header = `-- ============================================================
-- Migration: 20260522000003_salons_seed.sql
-- Description:
--   output/{site}.csv（公式サイト × 予約サイト URL ペア）を salons に冪等同期する。
--   apps/scraper/src/scripts/build_salons_seed.ts で生成された自動生成 SQL。
--   手動編集禁止。CSV を更新したら \`npm run -w scraper build:salons-seed\` を再実行する。
--
--   挙動:
--     - (site_id, shop_id) が既存 → name / url / homepage_url を CSV 値で上書き
--       (CSV を正とする方針)
--     - (site_id, shop_id) が新規 → INSERT
--     - 本番にあるが CSV に無い salons → 触らない（別経路で追加されたものを尊重）
--
--   site_id 解決は sites.name 経由。20260522000001_canonicalize_sites.sql で
--   sites.name に UNIQUE 制約を張った前提なので、name → id は一意に解決される。
-- ============================================================

`;
  const sql = header + buildSqlBlock(rows);
  const outPath = join(ROOT, 'supabase/migrations/20260522000003_salons_seed.sql');
  writeFileSync(outPath, sql);
  return outPath;
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
  const salonsHeader = `-- ============================================================
-- salons
-- ローカル / CI 用に migration 20260522000003 と同等の内容を投入する。
-- apps/scraper/src/scripts/build_salons_seed.ts で自動生成。手動編集禁止。
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

  const migrationPath = writeMigration(sorted);
  const seedPath = writeSeed(sorted);

  const bySite = new Map<SiteName, number>();
  for (const r of sorted) {
    bySite.set(r.site, (bySite.get(r.site) ?? 0) + 1);
  }
  console.log(`Wrote ${sorted.length} salons`);
  for (const [site, n] of bySite) {
    console.log(`  ${site}: ${n}`);
  }
  console.log(`  migration: ${migrationPath}`);
  console.log(`  seed:      ${seedPath}`);
}

main();
