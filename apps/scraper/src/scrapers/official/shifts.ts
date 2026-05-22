import * as cheerio from 'cheerio';
import type {
  OfficialShiftRecord,
  OfficialShiftScraper,
} from '@alimashita/shared';
import { httpHomepage } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('official:shifts');

/**
 * 日付らしき文字列の検出パターン。
 *   "05月21日（木）" / "5/21" / "2026-05-21" / "2026年5月21日" などにヒットする。
 * - capture[1]: 年 (optional)
 * - capture[2]: 月
 * - capture[3]: 日
 */
const DATE_PATTERN =
  /(?:(\d{4})[\/\-年])?\s*(\d{1,2})\s*[\/\-月]\s*(\d{1,2})\s*(?:日)?/;

/**
 * 時間範囲パターン。
 *   "12:00～18:00" / "12:00〜18:00" / "12:00-18:00" / "12:00 ~ 18:00" / "12:00ー18:00"
 *   を許容する。
 *
 * 全角チルダ (～ U+FF5E)、波ダッシュ (〜 U+301C)、ASCII チルダ (~)、
 * ハイフン (-)、長音符 (ー)、各種ダッシュ (– —) を区切りとして許容。
 */
const TIME_RANGE_PATTERN =
  /(\d{1,2}):(\d{2})\s*[〜～~\-–—ー]+\s*(\d{1,2}):(\d{2})/;

/**
 * SCHEDULE セクションを示しているらしき heading 内のキーワード。
 * mens-este.com 系の `<h2>SCHEDULE 出勤予定</h2>` 構造を最初の手掛かりにする。
 */
const SCHEDULE_KEYWORDS = ['SCHEDULE', '出勤予定', '出勤情報', '出勤スケジュール', 'スケジュール'];

interface ParseOptions {
  /** 「今日」とみなす基準時刻。年推定 (12月→1月跨ぎ等) に使う。テスト用に上書きできる。 */
  now?: Date;
}

/**
 * `(month, day)` から「今日に最も近い」年を推定する。
 *
 * 公式サイトのシフト表は通常「直近 1-2 週」を表示しているため、未来寄り (今日以降) を優先。
 * 例:
 *   - today = 12/30, observed = 1/3 → 翌年 1/3
 *   - today =  1/3,  observed = 12/30 → 今年は 1 月なので 12/30 はぎりぎり過去扱いされる
 *     (1 日以上の過去は捨て、翌年 12/30 を採用)
 */
function inferYear(month: number, day: number, today: Date): number {
  const todayMs = today.getTime();
  const candidates = [today.getFullYear(), today.getFullYear() + 1, today.getFullYear() - 1];
  let bestYear = today.getFullYear();
  let bestScore = Number.POSITIVE_INFINITY;
  for (const year of candidates) {
    const candidate = new Date(year, month - 1, day, 0, 0, 0).getTime();
    const diff = candidate - todayMs;
    if (diff < -24 * 60 * 60 * 1000) continue;
    const score = Math.abs(diff);
    if (score < bestScore) {
      bestScore = score;
      bestYear = year;
    }
  }
  return bestYear;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function tryParseDate(text: string, now: Date): string | null {
  const m = text.match(DATE_PATTERN);
  if (!m) return null;
  const month = Number.parseInt(m[2] ?? '', 10);
  const day = Number.parseInt(m[3] ?? '', 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const year = m[1] ? Number.parseInt(m[1], 10) : inferYear(month, day, now);
  if (!Number.isFinite(year)) return null;
  return isoDate(year, month, day);
}

interface TimeRange {
  /** HH:mm:ss */
  start: string;
  /** HH:mm:ss */
  end: string;
}

function tryParseTimeRange(text: string): TimeRange | null {
  const m = text.match(TIME_RANGE_PATTERN);
  if (!m) return null;
  const sh = Number.parseInt(m[1]!, 10);
  const sm = Number.parseInt(m[2]!, 10);
  const eh = Number.parseInt(m[3]!, 10);
  const em = Number.parseInt(m[4]!, 10);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return null;
  // 28:00 のような「翌日時刻」表記は許容するが、47:59 を超えるものはノイズとみなして捨てる。
  if (sh < 0 || sh > 47 || eh < 0 || eh > 47) return null;
  if (sm < 0 || sm > 59 || em < 0 || em > 59) return null;
  return {
    start: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`,
    end: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`,
  };
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map((s) => Number.parseInt(s, 10));
  return h! * 60 + m!;
}

/**
 * `(date, start, end)` を `external_therapist_shifts` 1 行 = 同日内に閉じる
 * `(date, shift_start, shift_end)` に正規化する。
 *
 * 1. end の hour が 24 以上なら、翌日に繰り越して `shift_end` を 24 引いた値にする。
 * 2. 1 の結果 end <= start なら「跨ぎ深夜」とみなし、当日 `[start, 23:59:00]` と
 *    翌日 `[00:00:00, end]` の 2 行に分割する。
 *    (estama の `normalizeDateTime` と同じ「日付の境界を 24:00 に切る」方針)
 * 3. 通常ケース (end > start, 同日内) はそのまま 1 行返す。
 */
function normalizeAndSplitShift(
  date: string,
  range: TimeRange,
): OfficialShiftRecord[] {
  let { start, end } = range;
  let endDate = date;

  const endHour = Number.parseInt(end.slice(0, 2), 10);
  if (endHour >= 24) {
    // "28:00" → 翌日 "04:00"
    const wrappedHour = endHour - 24;
    end = `${String(wrappedHour).padStart(2, '0')}${end.slice(2)}`;
    endDate = addDaysIso(date, 1);
  }

  if (date !== endDate) {
    return [
      { date, shift_start: start, shift_end: '23:59:00' },
      { date: endDate, shift_start: '00:00:00', shift_end: end },
    ];
  }

  if (toMinutes(end) <= toMinutes(start)) {
    // 表記上は同日 ("22:00-04:00" を 24:00+ 表記せず書いている公式サイト) → 2 行に分割
    return [
      { date, shift_start: start, shift_end: '23:59:00' },
      { date: addDaysIso(date, 1), shift_start: '00:00:00', shift_end: end },
    ];
  }

  return [{ date, shift_start: start, shift_end: end }];
}

interface ScheduleToken {
  text: string;
  /** 入力 DOM の登場順 (パーサ内部で使う) */
  order: number;
}

/**
 * `collectScheduleTokensInternal` がパース判断の根拠として残す内部トレース。
 * パーサ本体は使わないが、`inspectOfficialShifts` でデバッグ表示に使う。
 */
interface CollectTrace {
  /** heading 走査時に検査した要素 (上位 50 件まで) と SCHEDULE_KEYWORDS マッチ有無。 */
  headingsScanned: Array<{ tag: string; classAttr: string; text: string; matched: boolean }>;
  /** 1 段階目で採用された schedule ルート要素 (= 最初にキーワードヒットした heading の親)。 */
  scheduleRoot: { tag: string; classAttr: string; idAttr: string } | null;
  /** 1 段階目が空振りで 2 段階目フォールバック (クラス名 schedule 系) を使ったか。 */
  fallbackUsed: boolean;
  /** 2 段階目で拾った要素サマリ (上位 20 件まで)。fallbackUsed=true のときに埋まる。 */
  fallbackMatches: Array<{ tag: string; classAttr: string }>;
}

interface CollectResult {
  tokens: ScheduleToken[];
  trace: CollectTrace;
}

/**
 * SCHEDULE セクションらしき要素から「シフト記述になりうる短いテキスト断片」を順序通りに集める。
 *
 * 戦略:
 *   1. SCHEDULE / 出勤予定 などのキーワードを含む heading / 要素を探索
 *   2. その親（または直近の祖先のうち prof_schedule / schedule クラスを持つもの）配下の
 *      `<li>` / `<dt>` / `<dd>` / `<td>` を順序通りに収集
 *   3. 1 で見つからなければ、全文から「明確な weekly schedule リスト」とみなせる箇所を探す
 *      フォールバックを試みる
 *
 * 戻り値は tokens に加えて `trace` を含む。trace は `inspectOfficialShifts` のデバッグ表示
 * 専用で、パーサ本体 (`parseOfficialShifts`) は参照しない。トレース収集による
 * オーバーヘッドは無視できるサイズに留めている (heading 上位 50, fallback 上位 20)。
 */
function collectScheduleTokensInternal($: cheerio.CheerioAPI): CollectResult {
  const tokens: ScheduleToken[] = [];
  const trace: CollectTrace = {
    headingsScanned: [],
    scheduleRoot: null,
    fallbackUsed: false,
    fallbackMatches: [],
  };
  let order = 0;
  const pushToken = (el: unknown): void => {
    const text = $(el as never).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    // 30 文字以上のテキストはキャプションや説明文の可能性が高い。weekly schedule の
    // セル一つは大抵 20 文字以下なので長すぎるものは捨てる。
    if (text.length > 30) return;
    tokens.push({ text, order: order++ });
  };

  // 1) heading から探す
  const headings = $('h1, h2, h3, h4, h5, h6, .heading, .article_tittle, .section_title');
  let scheduleRootEl: unknown | null = null;
  headings.each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const matched = SCHEDULE_KEYWORDS.some((k) =>
      text.toUpperCase().includes(k.toUpperCase()),
    );
    if (trace.headingsScanned.length < 50) {
      const tagName = ((el as { tagName?: string }).tagName ?? '').toLowerCase();
      const classAttr = $(el).attr('class') ?? '';
      trace.headingsScanned.push({ tag: tagName, classAttr, text, matched });
    }
    if (scheduleRootEl) return;
    if (matched) {
      // heading のすぐ後ろにある兄弟か、heading の親をルートとして扱う
      const parent = $(el).parent();
      const rootNode = (parent.length > 0 ? parent[0] : el) as unknown;
      scheduleRootEl = rootNode;
      const rootTag = ((rootNode as { tagName?: string }).tagName ?? '').toLowerCase();
      const rootClass = $(rootNode as never).attr('class') ?? '';
      const rootId = $(rootNode as never).attr('id') ?? '';
      trace.scheduleRoot = { tag: rootTag, classAttr: rootClass, idAttr: rootId };
    }
  });

  if (scheduleRootEl) {
    // ルート配下の list-like 要素から token を引く
    $(scheduleRootEl as never)
      .find('li, dt, dd, td')
      .each((_, el) => pushToken(el));
  }

  if (tokens.length === 0) {
    // 2) フォールバック: クラス名に schedule / weekly を含む要素配下を探す
    trace.fallbackUsed = true;
    const fb = $('.prof_weekly, .schedule, .prof_schedule, [class*="schedule"]');
    fb.each((_, el) => {
      if (trace.fallbackMatches.length >= 20) return;
      const tagName = ((el as { tagName?: string }).tagName ?? '').toLowerCase();
      const classAttr = $(el).attr('class') ?? '';
      trace.fallbackMatches.push({ tag: tagName, classAttr });
    });
    fb.find('li, dt, dd, td').each((_, el) => pushToken(el));
  }

  return { tokens, trace };
}

function collectScheduleTokens($: cheerio.CheerioAPI): ScheduleToken[] {
  return collectScheduleTokensInternal($).tokens;
}

/**
 * cheerio で読んだ HTML から OfficialShiftRecord[] を抽出するエクスポート関数。
 * テストや単体検証で URL 経由を介さず使えるよう、HTML 文字列を直接受け取る形にしておく。
 */
export function parseOfficialShifts(
  html: string,
  options: ParseOptions = {},
): OfficialShiftRecord[] {
  const now = options.now ?? new Date();
  const $ = cheerio.load(html);

  const tokens = collectScheduleTokens($);
  if (tokens.length === 0) {
    return [];
  }

  // トークン列を順に走査し、(date, status) ペアを抽出する。
  // 公式サイトの典型は <li>日付</li><li>状態</li> の交互パターン。
  // ただし「日付の次が必ず status」とは限らず、トークンが (date, date, range) のように
  // 並ぶ可能性 (heading のサブ要素を拾ってしまった場合等) もあるため、
  // - date を見つけたら「次に見つかった range / その日付以外の status まで」を読む
  // - 別の date が先に来たら「直前の date は status 不明 = 出勤外」とみなして捨てる
  const records: OfficialShiftRecord[] = [];
  const seen = new Set<string>(); // 重複防止: `${date}T${start}-${end}`
  let pendingDate: string | null = null;

  for (const tok of tokens) {
    const date = tryParseDate(tok.text, now);
    if (date) {
      // 新しい日付が来たら pending を捨てて差し替える
      pendingDate = date;
      continue;
    }
    if (!pendingDate) continue;

    const range = tryParseTimeRange(tok.text);
    if (!range) {
      // 「ご予約満了」「-」「休」「お休み」等は status だが時間範囲が無い → 行を作らない。
      // pendingDate はそのまま無効化して次のループへ。
      pendingDate = null;
      continue;
    }

    for (const rec of normalizeAndSplitShift(pendingDate, range)) {
      const key = `${rec.date}T${rec.shift_start}-${rec.shift_end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(rec);
    }
    pendingDate = null;
  }

  records.sort((a, b) =>
    a.date === b.date
      ? a.shift_start.localeCompare(b.shift_start)
      : a.date.localeCompare(b.date),
  );
  return records;
}

/**
 * `inspectOfficialShifts` の返却型。`audit_official_shifts.ts --inspect=URL` から
 * 「現パーサが HTML をどう見たか」を可視化するためのデバッグ用情報を含む。
 */
export interface OfficialShiftsInspectResult {
  /** 入力 HTML のバイト数 (UTF-16 length そのままなので参考値)。 */
  htmlSize: number;
  /** 走査した heading 候補 (上位 50 件)。matched が true のものが採用候補。 */
  headingsScanned: Array<{ tag: string; classAttr: string; text: string; matched: boolean }>;
  /** SCHEDULE_KEYWORDS にヒットした heading の親 (= 1 段階目で採用された root)。 */
  scheduleRoot: { tag: string; classAttr: string; idAttr: string } | null;
  /** 1 段階目空振りでフォールバック (クラス名 schedule 系) を使ったか。 */
  fallbackUsed: boolean;
  /** 2 段階目で拾った要素サマリ (上位 20 件)。 */
  fallbackMatches: Array<{ tag: string; classAttr: string }>;
  /** 抽出された raw tokens (date / time range 候補となるテキスト断片)。先頭 100 件まで。 */
  tokens: Array<{ text: string; order: number }>;
  /** トークン総数 (tokens は 100 件で打ち切るのでこちらが実数)。 */
  tokenCount: number;
  /** parseOfficialShifts() と同じ最終解釈結果。 */
  records: OfficialShiftRecord[];
}

/**
 * `parseOfficialShifts` と同等の処理を回しつつ、内部状態をトレースして返すデバッグ用 API。
 *
 * 使用箇所:
 *   - apps/scraper/src/scripts/audit_official_shifts.ts の --inspect=URL モード
 *   - パーサ拡張時の単体スクラッチ確認
 *
 * 副作用なし。`parseOfficialShifts` 本体の挙動は変えない。
 */
export function inspectOfficialShifts(
  html: string,
  options: ParseOptions = {},
): OfficialShiftsInspectResult {
  const $ = cheerio.load(html);
  const { tokens, trace } = collectScheduleTokensInternal($);
  const records = parseOfficialShifts(html, options);
  return {
    htmlSize: html.length,
    headingsScanned: trace.headingsScanned,
    scheduleRoot: trace.scheduleRoot,
    fallbackUsed: trace.fallbackUsed,
    fallbackMatches: trace.fallbackMatches,
    tokens: tokens.slice(0, 100).map((t) => ({ text: t.text, order: t.order })),
    tokenCount: tokens.length,
    records,
  };
}

/**
 * 公式サイト個別ページから OfficialShiftRecord[] を取得するスクレイパ実装。
 *
 * 入力は `external_therapists.therapist_url` (= 公式サイト上のセラピスト個別ページ URL)。
 * 404 / レイアウト不一致時は空配列を返し、ジョブ側はそれを正常扱いで先に進める。
 */
class OfficialShiftScraperImpl implements OfficialShiftScraper {
  async run(therapistUrl: string): Promise<OfficialShiftRecord[]> {
    if (!/^https?:\/\//i.test(therapistUrl)) {
      log.warn('Skip invalid therapist_url', { url: therapistUrl });
      return [];
    }
    let html: string;
    try {
      html = await httpHomepage.getHtml(therapistUrl);
    } catch (err) {
      log.warn('Failed to fetch official therapist page', {
        url: therapistUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    const records = parseOfficialShifts(html);
    log.info(`Parsed ${records.length} shift row(s)`, { url: therapistUrl });
    return records;
  }
}

export const officialShiftScraper: OfficialShiftScraper = new OfficialShiftScraperImpl();
