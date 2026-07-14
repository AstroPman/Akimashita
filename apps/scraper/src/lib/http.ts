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

/** Playwright / 外部ブラウザから CookieJar へ注入する Cookie 1 件分。 */
export type InjectedCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  /** Unix 秒。未指定 or <=0 ならセッション Cookie 扱い。 */
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export interface SiteHttp {
  name: string;
  getHtml(url: string, init?: RequestInit, overrides?: RequestOverrides): Promise<string>;
  getJson<T = unknown>(
    url: string,
    init?: RequestInit,
    overrides?: RequestOverrides,
  ): Promise<T>;
  /**
   * application/x-www-form-urlencoded で POST し、レスポンスを文字列として受け取る。
   *
   * Laravel の AJAX エンドポイント (e-yoyaku の `/shop/{id}/girl/ajax/` 等) は
   * 「JSON 用ヘッダ (X-Requested-With, Sec-Fetch-Mode: cors, Origin) で叩くが
   * レスポンス本体は HTML 断片」というパターンが多い。getJson だと JSON.parse が
   * 失敗するし、getHtml だと NAVIGATION_HEADERS (Sec-Fetch-Mode: navigate 等) が
   * 乗ってサーバ側の検査で弾かれることがある。両者の中間として用意した API。
   *
   * Content-Type は呼び出し側で extraHeaders に渡されない限り
   * `application/x-www-form-urlencoded;charset=utf-8` を送る。
   */
  postForm(
    url: string,
    form: Record<string, string> | URLSearchParams,
    extraHeaders?: Record<string, string>,
    overrides?: RequestOverrides,
  ): Promise<string>;
  /**
   * 現在の CookieJar を完全破棄して新しい Jar に差し替える。
   *
   * scraper 側で「セッション境界 = サロン境界」のような意味づけを明示するために使う。
   * createHttp の cookieRotateEvery と違って自動 N 回ごとではなく、呼び出し側が
   * 任意のタイミングで「ここから別人」を表現できる。
   */
  rotateCookies(): void;
  /**
   * 外部取得した Cookie を Jar に注入する (Cloudflare cf_clearance 等)。
   * `rotateCookies()` 後は消えるので、注入し直す必要がある。
   */
  setCookies(url: string, cookies: InjectedCookie[]): Promise<void>;
  /**
   * 下位の HTTP 実装を差し替える (Playwright APIRequest で TLS 指紋を揃える等)。
   * `null` を渡すとグローバル `fetch` に戻す。
   */
  setFetchImpl(impl: typeof fetch | null): void;
  /**
   * 指定 URL に対する CookieJar の cookie 値を取得する (生 raw 値、URL decode 前)。
   * XSRF-TOKEN を AJAX の X-XSRF-TOKEN ヘッダに乗せる用途を想定。
   */
  getCookieValue(url: string, name: string): Promise<string | undefined>;
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

/**
 * 同一サイトが大規模 IP/Bot ブロックされた疑いがあるときに、
 * 残ジョブを即時打ち切るためのエラー。
 *
 * リトライ対象ではない。ジョブ側 (Stage 2 / Stage 3) は catch して
 * 「以降の対象も同じく弾かれる可能性が高い」として処理を中断する。
 *
 * トリガー条件は connect 失敗 / 403 の連続検知 (詳細は CircuitBreaker)。
 */
export class HttpCircuitBreakerError extends Error {
  constructor(
    public readonly siteName: string,
    public readonly cooldownUntil: Date,
    public readonly reason: string,
  ) {
    super(
      `HTTP circuit breaker open for site=${siteName} until ${cooldownUntil.toISOString()} (${reason})`,
    );
    this.name = 'HttpCircuitBreakerError';
  }
}

export function isCircuitBreakerError(err: unknown): err is HttpCircuitBreakerError {
  return err instanceof HttpCircuitBreakerError;
}

/**
 * 「リソースが恒久的に存在しない」とみなせる HTTP エラーか。
 *
 * 404 (Not Found) と 410 (Gone) を同一視する。
 * これらはサーバーが「このリソースはもう存在しない」と明示しているため、
 * Stage 2/3 で検知した場合は対象を論理削除して以後の確認対象から外す。
 *
 * 403 / 5xx / ネットワーク途切れ等は一時障害の可能性が残るため含めない。
 * `homepage_resolver.ts:shouldSoftDeleteExternalSalonForHomepageFailure` も
 * 同じ 404/410 ポリシーを採用している。
 */
export function isGonePageError(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 404 || err.status === 410);
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
 * - cookieRotateEvery: N リクエストごとに CookieJar を破棄して再生成する。
 *   1 にすると毎リクエスト独立セッション (= ボット視点では「新しいタブで都度開き直す」相当)。
 *   ranking-deli.jp / e-yoyaku.jp 系のように「同一 session で多店舗巡回」が
 *   検知される WAF を回避する用途。0 / 未指定なら従来挙動 (Jar は共有・無期限)。
 * - circuitBreaker: 連続失敗を検知してジョブを早期中断するためのオプション。
 *   詳細は CircuitBreakerOptions を参照。
 *
 * 数値系はサイト個別の環境変数で上書きできる:
 *   SCRAPER_HTTP_CONCURRENCY_<NAME>
 *   SCRAPER_HTTP_DELAY_MIN_MS_<NAME>
 *   SCRAPER_HTTP_DELAY_MAX_MS_<NAME>
 *   SCRAPER_HTTP_COOKIE_ROTATE_EVERY_<NAME>
 * <NAME> は preset.name を大文字化したもの (例: caskan → CASKAN)。
 */
export type CreateHttpOptions = {
  maxRetries?: number;
  timeoutMs?: number;
  hostConcurrency?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  cookieRotateEvery?: number;
  circuitBreaker?: CircuitBreakerOptions;
  /**
   * true にすると redirect を手動ループで処理する。
   *
   * デフォルト (`redirect: 'follow'`) の fetch 内部 redirect は、
   * redirect chain の途中で発行された `Set-Cookie` を **CookieJar に保存しない**
   * という弱点がある。同一ドメイン内 redirect なら fetch 内部の暗黙 Cookie 共有で
   * 問題ないが、cross-domain redirect (e-yoyaku.jp ↔ ranking-deli.jp) で
   * `e_yoyaku_ekichika_session` のような session 確立 Cookie が中継的に発行される
   * ケースでは、Cookie が中継先に届かず最終 GET で WAF に「session 無し」と
   * 判定されて TCP RST されてしまう (実機で fetch failed が連発する形)。
   *
   * このオプションを true にすると、redirect ごとに手動で Set-Cookie を Jar に
   * 保存し、次の URL に対する Cookie ヘッダを再構築してから発行する。
   * 副作用として redirect ごとに 1 リクエストずつ HostSemaphore を取り直さず
   * 1 リクエスト = redirect chain 全体として扱うため、ホスト負荷は変わらない。
   *
   * デフォルト false (= 従来通り fetch 任せ)。
   */
  manualRedirect?: boolean;
};

/**
 * 連続失敗時にサイト単位で以降のリクエストを即座に弾くサーキットブレーカ。
 *
 * 想定シナリオ: 駅ちか系 WAF が IP ベースで 403 をばらまき始めると、
 * 1 リクエスト ≒ 数百 ms で残り 100+ サロンが全て失敗する事故が起きる
 * (実機ログ参照)。閾値を超えたら以降の同サイト呼び出しは
 * HttpCircuitBreakerError を即 throw して、ジョブ側でループを抜けられるようにする。
 *
 * - consecutiveBlockingThreshold:
 *   「ブロック疑い」エラー (HTTP 403 / 連続 fetch failed) の連続発生回数。
 *   この回数に達したらブレーカ OPEN にして cooldown 期間中は全リクエストを即拒否。
 * - cooldownMs:
 *   OPEN から HALF-OPEN になるまでの待機時間 (ms)。HALF-OPEN 中の最初の
 *   1 件が成功すれば閉じる、失敗すれば再度 OPEN にして同じ cooldown を待つ。
 *
 * 連続成功 (200/3xx) を観測したらカウンタはリセットされる。
 */
export type CircuitBreakerOptions = {
  consecutiveBlockingThreshold: number;
  cooldownMs: number;
};

type CircuitState =
  | { type: 'closed'; consecutive: number }
  | { type: 'open'; openedAt: number; cooldownMs: number; reason: string };

/**
 * 「Bot ブロック疑い」とみなすエラー判定。
 * - HTTP 403 (典型的な WAF レスポンス)
 * - fetch failed / TCP/TLS 系エラー (連続発生は接続ブロックの可能性)
 *
 * これ以外 (404/410/5xx/Abort 等) は対象外 (= サイト全体のブロックではなく個別事象とみなす)。
 */
function isBlockingError(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 403;
  if (err instanceof Error) {
    return /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(err.message);
  }
  return false;
}

function readSiteEnvInt(prefix: string, presetName: string): number | undefined {
  const key = `${prefix}_${presetName.toUpperCase()}`;
  const raw = process.env[key];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * fetch 内部の自動 redirect (`redirect: 'follow'`) を使う実装。
 * 同一ドメイン内 redirect が中心のサイトで使う。
 * redirect chain 中の Set-Cookie は CookieJar には保存されない (fetch 内部の
 * 暗黙クッキー共有で済むため通常は問題ないが、cross-domain redirect で
 * session cookie が中継的に発行されるケースには対応できない)。
 */
async function fetchWithAutoRedirect(
  jar: CookieJar,
  preset: HttpPreset,
  mode: 'html' | 'json',
  url: string,
  init: RequestInit | undefined,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const cookieHeader = (await jar.getCookieString(url)) || null;
  const response = await fetchImpl(url, {
    ...init,
    method: init?.method ?? 'GET',
    redirect: init?.redirect ?? 'follow',
    headers: buildHeaders(preset, mode, init?.headers, cookieHeader),
    signal,
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    await jar.setCookie(sc, response.url).catch(() => undefined);
  }
  return response;
}

/**
 * redirect を手動ループで処理する実装。
 *
 * 各ステップで Set-Cookie を CookieJar に保存し、次の URL に対する Cookie ヘッダを
 * その都度再構築してから発行する。cross-domain redirect で session cookie が
 * 中継的に発行されるサイト (e-yoyaku.jp ↔ ranking-deli.jp 等) で必須。
 *
 * - 上限 20 ホップ。それを超えたら Error を投げる (循環 redirect 検知)。
 * - 303 See Other は method を強制的に GET に切り替え、body を捨てる (HTTP/1.1 標準)。
 * - 307 / 308 は method / body を保持する (RFC 7231)。
 * - 301 / 302 はブラウザ慣習に合わせて GET へ降格する。
 */
async function fetchWithManualRedirect(
  jar: CookieJar,
  preset: HttpPreset,
  mode: 'html' | 'json',
  url: string,
  init: RequestInit | undefined,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const MAX_HOPS = 20;
  let current = url;
  let method = init?.method ?? 'GET';
  let body = init?.body ?? null;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const cookieHeader = (await jar.getCookieString(current)) || null;
    const response = await fetchImpl(current, {
      ...init,
      method,
      body,
      redirect: 'manual',
      headers: buildHeaders(preset, mode, init?.headers, cookieHeader),
      signal,
    });

    // Set-Cookie はリダイレクト先に進む前に必ず保存する。これが本ヘルパの存在意義。
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      await jar.setCookie(sc, current).catch(() => undefined);
    }

    const status = response.status;
    if (status >= 300 && status < 400 && status !== 304) {
      const location = response.headers.get('location');
      if (!location) {
        // location が無い 3xx は redirect とみなさず、そのまま呼び出し側に返す。
        return response;
      }
      // body を読み捨てて TCP コネクションを解放 (Node fetch は内部 stream の
      // GC を待つと再利用効率が落ちる)。
      await response.text().catch(() => undefined);

      current = new URL(location, current).toString();
      // 301/302/303 は method を GET に降格 (ブラウザ慣習)。
      // 307/308 は元 method / body を維持。
      if (status === 303 || status === 301 || status === 302) {
        method = 'GET';
        body = null;
      }
      continue;
    }
    return response;
  }
  throw new Error(`Too many redirects (>${MAX_HOPS}) starting from ${url}`);
}

export function createHttp(preset: HttpPreset, opts?: CreateHttpOptions): SiteHttp {
  // cookieRotateEvery が指定されていれば「N リクエストごとに新しい Jar」を生成。
  // 0 / 未指定なら Jar はプロセスライフタイム永続 (= 従来挙動)。
  let jar = new CookieJar();
  let jarRequestCount = 0;
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
  const cookieRotateEvery = Math.max(
    0,
    readSiteEnvInt('SCRAPER_HTTP_COOKIE_ROTATE_EVERY', preset.name) ??
      opts?.cookieRotateEvery ??
      0,
  );
  const manualRedirect = opts?.manualRedirect ?? false;
  // Cloudflare warmup 等で Playwright の TLS 指紋付き fetch に差し替える。
  let fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);

  // サーキットブレーカ状態。preset (=site) に閉じたインスタンス。
  // 利用するかどうかは opts?.circuitBreaker の有無で決まる。
  const breakerOpts = opts?.circuitBreaker ?? null;
  let circuit: CircuitState = { type: 'closed', consecutive: 0 };

  function checkCircuit(): void {
    if (!breakerOpts || circuit.type !== 'open') return;
    const elapsed = Date.now() - circuit.openedAt;
    if (elapsed < circuit.cooldownMs) {
      const until = new Date(circuit.openedAt + circuit.cooldownMs);
      throw new HttpCircuitBreakerError(preset.name, until, circuit.reason);
    }
    // cooldown 経過 → HALF-OPEN: 試験的に 1 リクエストだけ通して挙動を見る。
    log.warn(`${preset.name} circuit breaker entering HALF-OPEN (cooldown elapsed)`);
    circuit = { type: 'closed', consecutive: 0 };
  }

  function recordSuccess(): void {
    if (!breakerOpts) return;
    if (circuit.type !== 'closed' || circuit.consecutive !== 0) {
      circuit = { type: 'closed', consecutive: 0 };
    }
  }

  function recordFailure(err: unknown): void {
    if (!breakerOpts) return;
    if (!isBlockingError(err)) {
      // 404/5xx 等は連続カウンタの対象外。連続成功と同等扱いにしてしまうと
      // 一時障害でブレーカが復旧してしまうため、ここでは何もしない (現状維持)。
      return;
    }
    const next =
      circuit.type === 'closed' ? circuit.consecutive + 1 : breakerOpts.consecutiveBlockingThreshold;
    if (next >= breakerOpts.consecutiveBlockingThreshold) {
      const reason =
        err instanceof HttpError
          ? `HTTP ${err.status}`
          : err instanceof Error
            ? err.message.slice(0, 80)
            : 'unknown';
      log.error(
        `${preset.name} circuit breaker OPEN (${next} consecutive blocking errors, cooldown ${breakerOpts.cooldownMs}ms)`,
        { reason },
      );
      circuit = {
        type: 'open',
        openedAt: Date.now(),
        cooldownMs: breakerOpts.cooldownMs,
        reason,
      };
    } else {
      circuit = { type: 'closed', consecutive: next };
    }
  }

  async function request(
    url: string,
    mode: 'html' | 'json',
    init?: RequestInit,
    overrides?: RequestOverrides,
  ): Promise<Response> {
    // サーキットブレーカ: 一定期間 OPEN の間は即座に拒否してジョブ側に通知する。
    // 並列度や HostSemaphore より外で判定しておくことで「ブロック中も無駄に
    // 接続スロットを取って待たされる」事故を防ぐ。
    checkCircuit();

    const host = new URL(url).host;
    const release = await semaphores.acquire(host, hostConcurrency);
    const metric = getMetric(preset.name);
    const effectiveMaxRetries = Math.max(
      0,
      overrides?.maxRetries ?? maxRetries,
    );
    try {
      // cookieRotateEvery > 0 の場合、 N 回ごとに完全新規 Jar に差し替える。
      // N=1 なら毎リクエスト独立。同一セッション (Cookie) で大量巡回することによる
      // セッション軸ボット検知の回避が目的。リクエスト直前で行うことで、
      // 「N 回目のリクエスト中に使う Jar」と「N+1 回目以降の Jar」を綺麗に分離できる。
      if (cookieRotateEvery > 0 && jarRequestCount >= cookieRotateEvery) {
        jar = new CookieJar();
        jarRequestCount = 0;
      }
      jarRequestCount += 1;

      await sleep(randomDelayMs(minDelayMs, maxDelayMs));
      const started = Date.now();
      try {
        const response = await withRetry(
          `${preset.name} ${mode.toUpperCase()} ${url}`,
          async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const response = manualRedirect
                ? await fetchWithManualRedirect(
                    jar,
                    preset,
                    mode,
                    url,
                    init,
                    controller.signal,
                    fetchImpl,
                  )
                : await fetchWithAutoRedirect(
                    jar,
                    preset,
                    mode,
                    url,
                    init,
                    controller.signal,
                    fetchImpl,
                  );

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
        recordSuccess();
        return response;
      } catch (err) {
        metric.errors += 1;
        recordFailure(err);
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
    async postForm(url, form, extraHeaders, overrides) {
      const body = form instanceof URLSearchParams ? form.toString() : new URLSearchParams(form).toString();
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        ...(extraHeaders ?? {}),
      };
      // mode='json' で API_HEADERS (Accept: application/json, Sec-Fetch-Mode: cors,
      // X-Requested-With: XMLHttpRequest) を載せつつ、レスポンスは生文字列で返す。
      const res = await request(url, 'json', { method: 'POST', body, headers }, overrides);
      return res.text();
    },
    rotateCookies() {
      jar = new CookieJar();
      jarRequestCount = 0;
    },
    async setCookies(url, cookies) {
      for (const c of cookies) {
        const parts = [`${c.name}=${c.value}`];
        if (c.domain) parts.push(`Domain=${c.domain}`);
        parts.push(`Path=${c.path && c.path.length > 0 ? c.path : '/'}`);
        if (typeof c.expires === 'number' && c.expires > 0) {
          parts.push(`Expires=${new Date(c.expires * 1000).toUTCString()}`);
        }
        if (c.secure) parts.push('Secure');
        if (c.httpOnly) parts.push('HttpOnly');
        if (c.sameSite) parts.push(`SameSite=${c.sameSite}`);
        await jar.setCookie(parts.join('; '), url);
      }
    },
    setFetchImpl(impl) {
      fetchImpl = impl ?? globalThis.fetch.bind(globalThis);
    },
    async getCookieValue(url, name) {
      const cookies = await jar.getCookies(url);
      return cookies.find((c) => c.key === name)?.value;
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
// area-list.php / area.php / salon.php / therapistlist.php を巡回する。
// Cloudflare がローカル IP 等にチャレンジ (403 + "Just a moment...") を返すことがあり、
// 連続 403 でジョブが数百サロンを空振りしないよう circuit breaker を付ける。
export const httpMenesthe = createHttp(
  {
    name: 'menesthe',
    baseUrl: 'https://men-esthe.jp',
    headers: {},
  },
  {
    circuitBreaker: {
      consecutiveBlockingThreshold: 5,
      cooldownMs: 30 * 60 * 1000,
    },
  },
);

// e-yoyaku.jp は ranking-deli.jp グループ (駅ちか) の「eネット予約」汎用予約システム。
// 初回アクセスで ranking-deli.jp 側 (/member/checklogin/...) に cross-domain redirect され、
// XSRF-TOKEN / e_yoyaku_ekichika_session / ekimypage_* Cookie が発行される。
// この session cookie が無いまま最終 GET に到達すると WAF が「session 無し」と判定して
// TCP RST するため、`manualRedirect: true` で redirect chain 中の Set-Cookie を都度 Jar に
// 保存し、次ホップで Cookie ヘッダを再構築して送る必要がある。
// (`redirect: 'follow'` だと fetch 内部の暗黙 Cookie が中継ドメインを跨げず fetch failed が頻発する)
//
// 全データ (セラピスト一覧 / 7-8 日分の 15 分刻みスロット) が SSR HTML に埋まっているため、
// API 経由ではなく getHtml() でナビゲーション扱いの取得を行う。
//
// ## 防御策
// - manualRedirect: true → cross-domain redirect 中の Set-Cookie を CookieJar に保存し、
//   次の URL で Cookie ヘッダを再構築する。これが無いと fetch failed が頻発する (実機検証済み)。
// - CookieJar はサロン境界で明示的に rotateCookies() する設計。
//   セラピスト一覧の AJAX ページネーション (POST /shop/{id}/girl/ajax/) が
//   1 ページ目で発行された XSRF-TOKEN / e_yoyaku_ekichika_session に依存するため、
//   「同一サロン内では Jar を共有」「サロン跨ぎでは別人として再ログイン相当」
//   を表現する必要がある。createHttp の cookieRotateEvery (N 回ごと自動 swap) では
//   サロン境界と一致させられないので、scraper 側で rotateCookies() を明示する。
// - circuitBreaker: 連続 5 回ブロック疑い (403 / TCP RST) を観測したら 30 分間
//   全リクエストを即拒否。134 サロン分のジョブが全滅する事故を防ぐ。
// - 個別 delay は `.env` / Lambda env から SCRAPER_HTTP_DELAY_MIN_MS_EYOYAKU /
//   SCRAPER_HTTP_DELAY_MAX_MS_EYOYAKU で 5-15 秒に伸ばす (driving env で設定)。
export const httpEyoyaku = createHttp(
  {
    name: 'eyoyaku',
    baseUrl: 'https://e-yoyaku.jp',
    headers: {},
  },
  {
    manualRedirect: true,
    circuitBreaker: {
      consecutiveBlockingThreshold: 5,
      cooldownMs: 30 * 60 * 1000,
    },
  },
);

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
