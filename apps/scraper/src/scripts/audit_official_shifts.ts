/**
 * Stage 5 (official_shifts) のパーサ・カバレッジを監査するワンショットスクリプト。
 *
 * 目的:
 *   `runOfficialShiftsJob` のターゲットは「watch_settings に登録された therapist」
 *   に限定されており、本番ログだけ眺めても "今 watch されている範囲" の偏った
 *   サンプルしか見えない。本スクリプトは watch_settings 制約を外し、
 *   external_therapists.therapist_url を母集団としてホスト単位で N 件ずつ
 *   サンプリングして parseOfficialShifts() の成功率を測定する。
 *
 * DB への書き込みは一切行わない (audit-only)。
 *
 * 出力:
 *   1. CSV (--out で指定、デフォルト output/official_shifts_coverage.csv)
 *      列: host, external_salon_id, salon_name, external_therapist_id,
 *          therapist_url, fetch_status, http_status, parsed_count,
 *          sample_records, error
 *   2. stdout に host 単位の集計サマリ (成功率順)
 *
 * CLI:
 *   tsx src/scripts/audit_official_shifts.ts [options]
 *     --per-host=N            ホストごとに最大 N 件サンプリング (default: 2)
 *     --max-hosts=N           上位 N ホストだけ調査 (default: 全件)
 *     --host=HOST             指定ホストだけ調査 (複数指定可: --host=a --host=b)
 *     --exclude-host=HOST     指定ホストを除外 (複数指定可)
 *     --internal-site=NAME    自社 salons.site_id = NAME のサロン配下のセラピストだけ調査
 *                             ({caskan|grow|edc|estama|eyoyaku})。指定時は salons.homepage_url の
 *                             host が「NAME のセルフホスト」のサロンは自動除外される。
 *                             例: --internal-site=estama で
 *                                「estama を予約システムに使ってるが公式 HP は別ドメイン」
 *                                のサロン配下だけが母集団になる。
 *     --concurrency=N         並列度 (default: OFFICIAL_SHIFTS_CONCURRENCY)
 *     --out=PATH              CSV 出力先 (default: output/official_shifts_coverage.csv)
 *
 * ノイズ除外のデフォルト:
 *   `estama.jp` / `e-yoyaku.jp` / `ranking-deli.jp` 系は「予約システム自体の
 *   ドメイン」が homepage_url に紛れているケースで Stage 5 の本来のターゲットでは
 *   ない（Layer 1 で取るべき）。デフォルトで除外する。
 *   `--include-system-hosts` を渡せば含める。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { SiteName } from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { parseOfficialShifts } from '../scrapers/official/shifts.js';
import { httpHomepage, HttpError } from '../lib/http.js';

const log = createLogger('audit:official_shifts');

const DEFAULT_EXCLUDE_HOSTS = new Set<string>([
  'estama.jp',
  'e-yoyaku.jp',
  'ranking-deli.jp',
]);

const KNOWN_SITES: ReadonlySet<SiteName> = new Set<SiteName>([
  'caskan',
  'grow',
  'edc',
  'estama',
  'eyoyaku',
]);

/**
 * 各予約サイトの「セルフホスト判定」。
 * salons.homepage_url の host がこれに該当するなら「公式 HP = 予約サイトそのもの」
 * とみなして audit 対象から外す。
 *
 * 例: estama を予約システムに使っているサロンで homepage_url も estama.jp になっている
 *     ケースは Layer 1 (Stage 3) で取るべきなので Stage 5 audit の対象にならない。
 */
function isSiteSelfHost(siteName: SiteName, host: string): boolean {
  const h = host.toLowerCase();
  switch (siteName) {
    case 'caskan':
      return h === 'r.caskan.jp';
    case 'grow':
      return h === 'grow-appt.com';
    case 'edc':
      return /\.esthe-datacenter\.com$/.test(h);
    case 'estama':
      return h === 'estama.jp' || h === 'www.estama.jp';
    case 'eyoyaku':
      return h === 'e-yoyaku.jp' || h === 'ranking-deli.jp';
  }
}

const DEFAULT_OUT = 'output/official_shifts_coverage.csv';

interface CliArgs {
  perHost: number;
  maxHosts: number | null;
  onlyHosts: Set<string> | null;
  excludeHosts: Set<string>;
  includeSystemHosts: boolean;
  internalSite: SiteName | null;
  concurrency: number;
  outPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const perHostArg = argv.find((a) => a.startsWith('--per-host='));
  const perHost = perHostArg
    ? Math.max(1, Number.parseInt(perHostArg.split('=', 2)[1] ?? '', 10) || 2)
    : 2;

  const maxHostsArg = argv.find((a) => a.startsWith('--max-hosts='));
  const maxHosts = maxHostsArg
    ? Math.max(1, Number.parseInt(maxHostsArg.split('=', 2)[1] ?? '', 10) || 0) || null
    : null;

  const onlyHostsRaw = argv
    .filter((a) => a.startsWith('--host='))
    .flatMap((a) => (a.split('=', 2)[1] ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  const onlyHosts = onlyHostsRaw.length > 0 ? new Set(onlyHostsRaw) : null;

  const excludeRaw = argv
    .filter((a) => a.startsWith('--exclude-host='))
    .flatMap((a) => (a.split('=', 2)[1] ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);

  const includeSystemHosts = argv.includes('--include-system-hosts');
  const excludeHosts = new Set<string>(excludeRaw);
  if (!includeSystemHosts) {
    for (const h of DEFAULT_EXCLUDE_HOSTS) excludeHosts.add(h);
  }

  const concurrencyArg = argv.find((a) => a.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? Math.max(1, Number.parseInt(concurrencyArg.split('=', 2)[1] ?? '', 10) || 0) || 8
    : 8;

  const outArg = argv.find((a) => a.startsWith('--out='));
  const outPath = outArg ? (outArg.split('=', 2)[1] ?? DEFAULT_OUT) : DEFAULT_OUT;

  const internalSiteArg = argv.find((a) => a.startsWith('--internal-site='));
  let internalSite: SiteName | null = null;
  if (internalSiteArg) {
    const v = (internalSiteArg.split('=', 2)[1] ?? '').trim();
    if (!KNOWN_SITES.has(v as SiteName)) {
      throw new Error(
        `--internal-site must be one of ${Array.from(KNOWN_SITES).join(' | ')} (got "${v}")`,
      );
    }
    internalSite = v as SiteName;
  }

  return {
    perHost,
    maxHosts,
    onlyHosts,
    excludeHosts,
    includeSystemHosts,
    internalSite,
    concurrency,
    outPath,
  };
}

interface CandidateRow {
  external_therapist_id: string;
  external_salon_id: string | null;
  salon_name: string | null;
  therapist_url: string;
  host: string;
}

interface RawRow {
  id: string;
  external_salon_id: string | null;
  therapist_url: string | null;
  external_salons:
    | { name: string | null }
    | { name: string | null }[]
    | null;
}

/** therapists JOIN salons JOIN external_therapists の生レスポンス。 */
interface InternalSiteRawRow {
  id: string;
  external_therapist_id: string | null;
  salons:
    | {
        id: string;
        name: string | null;
        homepage_url: string | null;
        deleted_at: string | null;
        sites: { name: string } | { name: string }[] | null;
      }
    | {
        id: string;
        name: string | null;
        homepage_url: string | null;
        deleted_at: string | null;
        sites: { name: string } | { name: string }[] | null;
      }[]
    | null;
  external_therapists:
    | {
        id: string;
        therapist_url: string | null;
        deleted_at: string | null;
        external_salon_id: string | null;
      }
    | {
        id: string;
        therapist_url: string | null;
        deleted_at: string | null;
        external_salon_id: string | null;
      }[]
    | null;
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function extractHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * external_therapists を 1000 件ずつページングして全件取得する。
 *
 * Supabase REST の制約上、1 リクエスト最大 1000 行までしか返らないため
 * `range` を使ってループする。母集団は本番で ~190k 件、転送量は ~20MB 程度。
 */
async function fetchAllCandidates(): Promise<CandidateRow[]> {
  const out: CandidateRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('external_therapists')
      .select('id, external_salon_id, therapist_url, external_salons(name)')
      .is('deleted_at', null)
      .not('therapist_url', 'is', null)
      .neq('therapist_url', '')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch external_therapists page (${from}-${to}): ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const raw of data as unknown as RawRow[]) {
      const url = raw.therapist_url;
      if (!url) continue;
      const host = extractHost(url);
      if (!host) continue;
      const salonRel = raw.external_salons;
      const salonName = Array.isArray(salonRel)
        ? (salonRel[0]?.name ?? null)
        : (salonRel?.name ?? null);
      out.push({
        external_therapist_id: raw.id,
        external_salon_id: raw.external_salon_id,
        salon_name: salonName,
        therapist_url: url,
        host,
      });
    }

    log.info(`Fetched external_therapists ${from}-${from + data.length - 1}`, {
      cumulative: out.length,
    });

    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/**
 * 「自社 salons.site_id = <siteName>」かつ「salons.homepage_url の host が
 * <siteName> のセルフホスト以外」の条件を満たすサロン配下のセラピストを母集団に取る。
 *
 * 例: --internal-site=estama
 *   → estama を予約システムに使ってるが、公式 HP は estama.jp 以外という
 *     サロン (= "estama は予約サイト兼情報掲載で更新が雑になりがちな対象") を絞り込む。
 *
 * 注意:
 *   salons.homepage_url の host 抽出は PostgREST から SQL 関数を呼べないため
 *   クライアント側で実施する。母集団のフィルタは内部 site のサロン数（数百〜数千）
 *   程度なので全行取得しても問題ない。
 */
async function fetchCandidatesByInternalSite(
  siteName: SiteName,
): Promise<CandidateRow[]> {
  const out: CandidateRow[] = [];
  const pageSize = 1000;
  let from = 0;
  let droppedSelfHost = 0;
  let droppedNoUrl = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('therapists')
      .select(
        'id, external_therapist_id, ' +
          'salons!inner(id, name, homepage_url, deleted_at, sites!inner(name)), ' +
          'external_therapists!inner(id, therapist_url, deleted_at, external_salon_id)',
      )
      .is('deleted_at', null)
      .not('external_therapist_id', 'is', null)
      .is('salons.deleted_at', null)
      .eq('salons.sites.name', siteName)
      .not('salons.homepage_url', 'is', null)
      .neq('salons.homepage_url', '')
      .is('external_therapists.deleted_at', null)
      .not('external_therapists.therapist_url', 'is', null)
      .neq('external_therapists.therapist_url', '')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(
        `Failed to fetch internal-site candidates page (${from}-${to}): ${error.message}`,
      );
    }
    if (!data || data.length === 0) break;

    for (const raw of data as unknown as InternalSiteRawRow[]) {
      const salon = unwrap(raw.salons);
      const ext = unwrap(raw.external_therapists);
      if (!salon || !ext || !ext.therapist_url) continue;

      // salons.homepage_url の host が siteName のセルフホストなら除外
      const hpHost = salon.homepage_url ? extractHost(salon.homepage_url) : null;
      if (!hpHost) {
        droppedNoUrl += 1;
        continue;
      }
      if (isSiteSelfHost(siteName, hpHost)) {
        droppedSelfHost += 1;
        continue;
      }

      const therapistUrlHost = extractHost(ext.therapist_url);
      if (!therapistUrlHost) continue;

      out.push({
        external_therapist_id: ext.id,
        external_salon_id: ext.external_salon_id,
        salon_name: salon.name,
        therapist_url: ext.therapist_url,
        host: therapistUrlHost,
      });
    }

    log.info(
      `Fetched internal-site=${siteName} rows ${from}-${from + data.length - 1}`,
      { cumulative: out.length, droppedSelfHost, droppedNoUrl },
    );

    if (data.length < pageSize) break;
    from += pageSize;
  }
  log.info(`Internal-site fetch complete`, {
    site: siteName,
    candidates: out.length,
    droppedSelfHost,
    droppedNoUrl,
  });
  return out;
}

interface HostBucket {
  host: string;
  samples: CandidateRow[];
  totalInHost: number;
}

/**
 * ホスト単位で N 件ずつサンプリングする。
 *
 * サンプル選択は createdAt 等の偏りを避けるため、各ホスト内で先頭から N 件
 * (= 内部 UUID 順) を取る。同一ホスト内は同一テンプレ前提なので「どの行を取るか」
 * の影響は限定的。完全な決定論を維持してリプロを容易にする。
 */
function sampleByHost(
  candidates: CandidateRow[],
  perHost: number,
  filter: { onlyHosts: Set<string> | null; excludeHosts: Set<string> },
): HostBucket[] {
  const byHost = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    if (filter.onlyHosts && !filter.onlyHosts.has(c.host)) continue;
    if (filter.excludeHosts.has(c.host)) continue;
    const arr = byHost.get(c.host);
    if (arr) arr.push(c);
    else byHost.set(c.host, [c]);
  }
  const buckets: HostBucket[] = [];
  for (const [host, rows] of byHost) {
    buckets.push({
      host,
      samples: rows.slice(0, perHost),
      totalInHost: rows.length,
    });
  }
  buckets.sort((a, b) => b.totalInHost - a.totalInHost);
  return buckets;
}

type FetchStatus = 'ok' | 'http_error' | 'fetch_error' | 'invalid_url';

interface AuditRecord {
  host: string;
  external_salon_id: string | null;
  salon_name: string | null;
  external_therapist_id: string;
  therapist_url: string;
  fetch_status: FetchStatus;
  http_status: number | null;
  parsed_count: number;
  sample_records: string;
  error: string;
}

async function auditOne(c: CandidateRow): Promise<AuditRecord> {
  if (!/^https?:\/\//i.test(c.therapist_url)) {
    return {
      host: c.host,
      external_salon_id: c.external_salon_id,
      salon_name: c.salon_name,
      external_therapist_id: c.external_therapist_id,
      therapist_url: c.therapist_url,
      fetch_status: 'invalid_url',
      http_status: null,
      parsed_count: 0,
      sample_records: '',
      error: 'invalid scheme',
    };
  }
  try {
    const html = await httpHomepage.getHtml(c.therapist_url);
    const records = parseOfficialShifts(html);
    return {
      host: c.host,
      external_salon_id: c.external_salon_id,
      salon_name: c.salon_name,
      external_therapist_id: c.external_therapist_id,
      therapist_url: c.therapist_url,
      fetch_status: 'ok',
      http_status: 200,
      parsed_count: records.length,
      sample_records: JSON.stringify(records.slice(0, 3)),
      error: '',
    };
  } catch (err) {
    if (err instanceof HttpError) {
      return {
        host: c.host,
        external_salon_id: c.external_salon_id,
        salon_name: c.salon_name,
        external_therapist_id: c.external_therapist_id,
        therapist_url: c.therapist_url,
        fetch_status: 'http_error',
        http_status: err.status,
        parsed_count: 0,
        sample_records: '',
        error: err.message,
      };
    }
    return {
      host: c.host,
      external_salon_id: c.external_salon_id,
      salon_name: c.salon_name,
      external_therapist_id: c.external_therapist_id,
      therapist_url: c.therapist_url,
      fetch_status: 'fetch_error',
      http_status: null,
      parsed_count: 0,
      sample_records: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const effective = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < effective; i++) {
    runners.push(
      (async () => {
        while (true) {
          const index = cursor++;
          if (index >= items.length) return;
          await worker(items[index]!, index);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

function csvEscape(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(records: AuditRecord[], outPath: string): void {
  const header = [
    'host',
    'external_salon_id',
    'salon_name',
    'external_therapist_id',
    'therapist_url',
    'fetch_status',
    'http_status',
    'parsed_count',
    'sample_records',
    'error',
  ].join(',');

  const lines = [header];
  for (const r of records) {
    lines.push(
      [
        r.host,
        r.external_salon_id ?? '',
        r.salon_name ?? '',
        r.external_therapist_id,
        r.therapist_url,
        r.fetch_status,
        r.http_status ?? '',
        r.parsed_count,
        r.sample_records,
        r.error,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  const absPath = resolve(process.cwd(), outPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, `${lines.join('\n')}\n`, 'utf8');
  log.info(`Wrote ${records.length} row(s) to ${absPath}`);
}

interface HostSummary {
  host: string;
  sampled: number;
  parsed_ok: number;
  parsed_zero: number;
  http_error: number;
  fetch_error: number;
  invalid_url: number;
  total_in_host: number;
}

function summarize(records: AuditRecord[], buckets: HostBucket[]): HostSummary[] {
  const totalByHost = new Map<string, number>();
  for (const b of buckets) totalByHost.set(b.host, b.totalInHost);

  const map = new Map<string, HostSummary>();
  for (const r of records) {
    let s = map.get(r.host);
    if (!s) {
      s = {
        host: r.host,
        sampled: 0,
        parsed_ok: 0,
        parsed_zero: 0,
        http_error: 0,
        fetch_error: 0,
        invalid_url: 0,
        total_in_host: totalByHost.get(r.host) ?? 0,
      };
      map.set(r.host, s);
    }
    s.sampled += 1;
    if (r.fetch_status === 'ok') {
      if (r.parsed_count > 0) s.parsed_ok += 1;
      else s.parsed_zero += 1;
    } else if (r.fetch_status === 'http_error') s.http_error += 1;
    else if (r.fetch_status === 'fetch_error') s.fetch_error += 1;
    else if (r.fetch_status === 'invalid_url') s.invalid_url += 1;
  }
  return Array.from(map.values()).sort((a, b) => {
    // 1) total_in_host (= 影響範囲) が大きい順
    if (b.total_in_host !== a.total_in_host) return b.total_in_host - a.total_in_host;
    // 2) parse 成功 0 のホストを上に
    const aOk = a.parsed_ok > 0 ? 1 : 0;
    const bOk = b.parsed_ok > 0 ? 1 : 0;
    return aOk - bOk;
  });
}

function printSummary(summaries: HostSummary[], buckets: HostBucket[]): void {
  let coveredTherapists = 0;
  let totalTherapists = 0;
  let parsedOkHosts = 0;
  for (const s of summaries) {
    totalTherapists += s.total_in_host;
    if (s.parsed_ok > 0) {
      coveredTherapists += s.total_in_host;
      parsedOkHosts += 1;
    }
  }
  const totalHosts = summaries.length;

  log.info('=== Audit summary ===', {
    total_hosts: totalHosts,
    parsed_ok_hosts: parsedOkHosts,
    parsed_ok_host_ratio:
      totalHosts > 0 ? `${((parsedOkHosts / totalHosts) * 100).toFixed(1)}%` : 'n/a',
    therapists_in_audited_hosts: totalTherapists,
    therapists_in_parsed_ok_hosts: coveredTherapists,
    therapist_coverage:
      totalTherapists > 0
        ? `${((coveredTherapists / totalTherapists) * 100).toFixed(1)}%`
        : 'n/a',
    buckets: buckets.length,
  });

  log.info('Top 30 hosts by total therapists (sampled):');
  for (const s of summaries.slice(0, 30)) {
    const status =
      s.parsed_ok > 0
        ? `OK  (${s.parsed_ok}/${s.sampled})`
        : s.http_error + s.fetch_error > 0
          ? `FAIL (http=${s.http_error} fetch=${s.fetch_error})`
          : `ZERO (${s.parsed_zero}/${s.sampled})`;
    log.info(`  ${s.host.padEnd(40)} total=${s.total_in_host.toString().padStart(5)}  ${status}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  log.info('Starting audit', {
    ...args,
    onlyHosts: args.onlyHosts ? Array.from(args.onlyHosts) : null,
    excludeHosts: Array.from(args.excludeHosts),
  });

  let candidates: CandidateRow[];
  if (args.internalSite) {
    log.info(`Fetching candidates via internal-site=${args.internalSite}`);
    candidates = await fetchCandidatesByInternalSite(args.internalSite);
  } else {
    log.info('Fetching external_therapists (paginated)');
    candidates = await fetchAllCandidates();
  }
  log.info(`Fetched candidates: ${candidates.length}`);

  let buckets = sampleByHost(candidates, args.perHost, {
    onlyHosts: args.onlyHosts,
    excludeHosts: args.excludeHosts,
  });
  if (args.maxHosts !== null) buckets = buckets.slice(0, args.maxHosts);

  const targets: CandidateRow[] = buckets.flatMap((b) => b.samples);

  log.info(`Sampled ${targets.length} therapist URL(s) across ${buckets.length} host(s)`, {
    per_host: args.perHost,
    max_hosts: args.maxHosts,
    excluded: Array.from(args.excludeHosts),
  });

  const records: AuditRecord[] = [];
  let done = 0;
  const total = targets.length;
  await runWithConcurrency(targets, args.concurrency, async (c) => {
    const r = await auditOne(c);
    records.push(r);
    done += 1;
    if (done % 50 === 0 || done === total) {
      log.info(`Progress ${done}/${total}`);
    }
  });

  records.sort((a, b) => (a.host === b.host ? 0 : a.host < b.host ? -1 : 1));

  writeCsv(records, args.outPath);

  const summaries = summarize(records, buckets);
  printSummary(summaries, buckets);
}

main().catch((err) => {
  log.error('Fatal error', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
