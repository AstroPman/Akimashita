import { CookieJar } from 'tough-cookie';
import { env } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('http');

export type HttpPreset = {
  name: string;
  baseUrl: string;
  headers: Record<string, string>;
  navigationHeaders?: Record<string, string>;
  apiHeaders?: Record<string, string>;
};

export interface RequestOverrides {
  /** 当該リクエストのみリトライ回数を上書きしたい場合に指定する。0 でリトライ無効。 */
  maxRetries?: number;
}

export interface SiteHttp {
  name: string;
  getHtml(url: string, init?: RequestInit, overrides?: RequestOverrides): Promise<string>;
  getJson<T = unknown>(
    url: string,
    init?: RequestInit,
    overrides?: RequestOverrides,
  ): Promise<T>;
}

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': env.USER_AGENT,
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Upgrade-Insecure-Requests': '1',
};

const NAVIGATION_HEADERS: Record<string, string> = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

const API_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'X-Requested-With': 'XMLHttpRequest',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minMs: number, maxMs: number): number {
  const min = Math.max(0, minMs);
  const max = Math.max(min, maxMs);
  return Math.floor(min + Math.random() * (max - min));
}

/**
 * ホスト単位の同時実行数を制限するセマフォ。
 *
 * 既存仕様は「ホスト1並列」固定だったが、本クラスでは concurrency を可変にして
 * site / preset 側で攻める/守るを切り替えられるようにする。
 * デフォルトの concurrency=1 は従来通り完全直列（最も丁寧な振る舞い）。
 *
 * concurrency は同一ホストに対する最初の run() 呼び出し時の値が採用される。
 * 後から異なる値で run() しても上書きしない（既に走っているリクエストとの一貫性を優先）。
 */
class HostSemaphores {
  private slots = new Map<string, { capacity: number; running: number; queue: Array<() => void> }>();

  async acquire(host: string, capacity: number): Promise<() => void> {
    let slot = this.slots.get(host);
    if (!slot) {
      slot = { capacity: Math.max(1, capacity), running: 0, queue: [] };
      this.slots.set(host, slot);
    }
    if (slot.running < slot.capacity) {
      slot.running += 1;
      return () => this.release(host);
    }
    return new Promise<() => void>((resolve) => {
      slot!.queue.push(() => {
        slot!.running += 1;
        resolve(() => this.release(host));
      });
    });
  }

  private release(host: string): void {
    const slot = this.slots.get(host);
    if (!slot) return;
    slot.running -= 1;
    const next = slot.queue.shift();
    if (next) next();
  }
}

const semaphores = new HostSemaphores();

/** site名 → メトリクス。createHttp() 経由のリクエストのみ計測。 */
type HttpMetric = {
  requests: number;
  errors: number;
  retries: number;
  totalElapsedMs: number;
  maxElapsedMs: number;
};

const httpMetrics = new Map<string, HttpMetric>();

function getMetric(name: string): HttpMetric {
  let m = httpMetrics.get(name);
  if (!m) {
    m = { requests: 0, errors: 0, retries: 0, totalElapsedMs: 0, maxElapsedMs: 0 };
    httpMetrics.set(name, m);
  }
  return m;
}

export function snapshotHttpMetrics(): Record<string, HttpMetric> {
  const out: Record<string, HttpMetric> = {};
  for (const [name, m] of httpMetrics.entries()) {
    out[name] = { ...m };
  }
  return out;
}

export function resetHttpMetrics(): void {
  httpMetrics.clear();
}

/**
 * snapshot 同士の差分を取って「この区間でのリクエスト統計」を出す。
 * ベンチで「ジョブ前」「ジョブ後」のスナップショットを取って比較するのに使う。
 */
export function diffHttpMetrics(
  before: Record<string, HttpMetric>,
  after: Record<string, HttpMetric>,
): Record<string, HttpMetric> {
  const out: Record<string, HttpMetric> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const b = before[key] ?? { requests: 0, errors: 0, retries: 0, totalElapsedMs: 0, maxElapsedMs: 0 };
    const a = after[key] ?? { requests: 0, errors: 0, retries: 0, totalElapsedMs: 0, maxElapsedMs: 0 };
    out[key] = {
      requests: a.requests - b.requests,
      errors: a.errors - b.errors,
      retries: a.retries - b.retries,
      totalElapsedMs: a.totalElapsedMs - b.totalElapsedMs,
      maxElapsedMs: Math.max(a.maxElapsedMs, b.maxElapsedMs),
    };
  }
  return out;
}

function buildHeaders(
  preset: HttpPreset,
  mode: 'html' | 'json',
  extra: HeadersInit | undefined,
  cookieHeader: string | null,
): Headers {
  const headers = new Headers({
    ...COMMON_HEADERS,
    ...(mode === 'html' ? NAVIGATION_HEADERS : API_HEADERS),
    ...preset.headers,
    ...(mode === 'html' ? preset.navigationHeaders ?? {} : preset.apiHeaders ?? {}),
  });
  if (cookieHeader) headers.set('Cookie', cookieHeader);
  if (extra) {
    const overlay = new Headers(extra);
    overlay.forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries: number,
  onRetry: () => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      if (!retryable || attempt === maxRetries) break;
      const wait = backoffMs(attempt, err);
      log.warn(`${label} failed (attempt ${attempt + 1}), retrying in ${wait}ms`, {
        error: errMessage(err),
      });
      onRetry();
      await sleep(wait);
    }
  }
  throw lastError;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status === 429 || err.status >= 500;
  }
  if (err instanceof Error) {
    return err.name === 'AbortError' || /fetch failed|ECONN|ETIMEDOUT|ENETUNREACH/i.test(err.message);
  }
  return false;
}

function backoffMs(attempt: number, err: unknown): number {
  if (err instanceof HttpError && err.retryAfterMs) return err.retryAfterMs;
  const base = 500 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status} ${url}`);
    this.name = 'HttpError';
  }
}

function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number.parseInt(headerValue, 10);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(headerValue);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/**
 * createHttp の第2引数。未指定時は env の HTTP_* / グローバル MIN/MAX_DELAY と同じ挙動。
 *
 * - hostConcurrency: 同一ホストに対する同時接続数 (デフォルト 1)。礼節維持なら 1 のまま。
 * - minDelayMs / maxDelayMs: 各リクエスト前にホストごとに挟むランダム待機の範囲。
 *   省略時は env.MIN_DELAY_MS / env.MAX_DELAY_MS。
 *
 * いずれもサイト個別の環境変数で上書きできる:
 *   SCRAPER_HTTP_CONCURRENCY_<NAME>
 *   SCRAPER_HTTP_DELAY_MIN_MS_<NAME>
 *   SCRAPER_HTTP_DELAY_MAX_MS_<NAME>
 * <NAME> は preset.name を大文字化したもの (例: caskan → CASKAN)。
 */
export type CreateHttpOptions = {
  maxRetries?: number;
  timeoutMs?: number;
  hostConcurrency?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
};

function readSiteEnvInt(prefix: string, presetName: string): number | undefined {
  const key = `${prefix}_${presetName.toUpperCase()}`;
  const raw = process.env[key];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function createHttp(preset: HttpPreset, opts?: CreateHttpOptions): SiteHttp {
  const jar = new CookieJar();
  const maxRetries = opts?.maxRetries ?? env.HTTP_MAX_RETRIES;
  const timeoutMs = opts?.timeoutMs ?? env.HTTP_TIMEOUT_MS;
  const hostConcurrency = Math.max(
    1,
    readSiteEnvInt('SCRAPER_HTTP_CONCURRENCY', preset.name) ?? opts?.hostConcurrency ?? 1,
  );
  const minDelayMs =
    readSiteEnvInt('SCRAPER_HTTP_DELAY_MIN_MS', preset.name) ??
    opts?.minDelayMs ??
    env.MIN_DELAY_MS;
  const maxDelayMs =
    readSiteEnvInt('SCRAPER_HTTP_DELAY_MAX_MS', preset.name) ??
    opts?.maxDelayMs ??
    env.MAX_DELAY_MS;

  async function request(
    url: string,
    mode: 'html' | 'json',
    init?: RequestInit,
    overrides?: RequestOverrides,
  ): Promise<Response> {
    const host = new URL(url).host;
    const release = await semaphores.acquire(host, hostConcurrency);
    const metric = getMetric(preset.name);
    const effectiveMaxRetries = Math.max(
      0,
      overrides?.maxRetries ?? maxRetries,
    );
    try {
      await sleep(randomDelayMs(minDelayMs, maxDelayMs));
      const started = Date.now();
      try {
        return await withRetry(
          `${preset.name} ${mode.toUpperCase()} ${url}`,
          async () => {
            const cookieHeader = (await jar.getCookieString(url)) || null;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const response = await fetch(url, {
                ...init,
                method: init?.method ?? 'GET',
                redirect: init?.redirect ?? 'follow',
                headers: buildHeaders(preset, mode, init?.headers, cookieHeader),
                signal: controller.signal,
              });

              const setCookies = response.headers.getSetCookie?.() ?? [];
              for (const sc of setCookies) {
                await jar.setCookie(sc, response.url).catch(() => undefined);
              }

              if (!response.ok) {
                const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
                throw new HttpError(response.status, url, retryAfterMs);
              }
              return response;
            } finally {
              clearTimeout(timer);
            }
          },
          effectiveMaxRetries,
          () => {
            metric.retries += 1;
          },
        );
      } catch (err) {
        metric.errors += 1;
        throw err;
      } finally {
        const elapsed = Date.now() - started;
        metric.requests += 1;
        metric.totalElapsedMs += elapsed;
        if (elapsed > metric.maxElapsedMs) metric.maxElapsedMs = elapsed;
      }
    } finally {
      release();
    }
  }

  return {
    name: preset.name,
    async getHtml(url, init, overrides) {
      const res = await request(url, 'html', init, overrides);
      return res.text();
    },
    async getJson<T>(url: string, init?: RequestInit, overrides?: RequestOverrides): Promise<T> {
      const res = await request(url, 'json', init, overrides);
      return (await res.json()) as T;
    },
  };
}

export const httpCaskan = createHttp({
  name: 'caskan',
  baseUrl: 'https://r.caskan.jp',
  headers: {},
});

export const httpGrow = createHttp({
  name: 'grow',
  baseUrl: 'https://grow-appt.com',
  headers: {},
  apiHeaders: {
    Origin: 'https://grow-appt.com',
  },
});

// EDC 系 (esthe-datacenter.com) の汎用予約システム。
// 店舗ごとにサブドメイン (reserve-{shop_id}.esthe-datacenter.com) が分かれるため、
// therapists 取得用の共有プリセット。
// availability ではセラピスト単位で wizardCode セッションを完全分離する必要があるため、
// scrapers/edc/availability.ts 側で createHttp(...) を毎回呼んで CookieJar を独立させる。
export const httpEdc = createHttp({
  name: 'edc',
  baseUrl: 'https://esthe-datacenter.com',
  headers: {},
});

// estama.jp はメンズエステ掲載ポータルで、店舗の予約も提供する。
// CookieJar は共通で問題ない (EDC のような Step セッション干渉はない)。
// 次週スケジュールは /post/shop_schedule_ctrl への POST で取るため、
// fetch 同士の干渉が起きないよう request 単位で完結する設計とする。
export const httpEstama = createHttp({
  name: 'estama',
  baseUrl: 'https://estama.jp',
  headers: {},
  apiHeaders: {
    Origin: 'https://estama.jp',
  },
});

// men-esthe.jp は外部ポータルでサロンマスタの参照元。
// area-list.php / area.php / salon.php を巡回するナビゲーション主体。
export const httpMenesthe = createHttp({
  name: 'menesthe',
  baseUrl: 'https://men-esthe.jp',
  headers: {},
});

/**
 * 任意の公式サイトを fetch するためのプリセット。
 * external_salons.homepage_url から予約システムリンクを抽出する用途で
 * 多数の独立ドメインを叩くため、汎用 UA + 共通ヘッダのみで構成する。
 * リトライは maxRetries:0（初回のみ）: Bot 対策・TLS 不整合などで恒久的に
 * `fetch failed` になりがちな URL が多く、既知サイトと同じ指数バックオフだと
 * bookings フェーズが直列で極端に遅くなるため。
 */
export const httpHomepage = createHttp(
  {
    name: 'homepage',
    baseUrl: '',
    headers: {},
  },
  { maxRetries: 0 },
);
