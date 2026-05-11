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

export interface SiteHttp {
  name: string;
  getHtml(url: string, init?: RequestInit): Promise<string>;
  getJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
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

function randomDelayMs(): number {
  const min = Math.max(0, env.MIN_DELAY_MS);
  const max = Math.max(min, env.MAX_DELAY_MS);
  return Math.floor(min + Math.random() * (max - min));
}

class HostQueue {
  private chains = new Map<string, Promise<unknown>>();

  run<T>(host: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(host) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.chains.set(
      host,
      next.catch(() => undefined),
    );
    return next;
  }
}

const queue = new HostQueue();

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

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= env.HTTP_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      if (!retryable || attempt === env.HTTP_MAX_RETRIES) break;
      const wait = backoffMs(attempt, err);
      log.warn(`${label} failed (attempt ${attempt + 1}), retrying in ${wait}ms`, {
        error: errMessage(err),
      });
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

export function createHttp(preset: HttpPreset): SiteHttp {
  const jar = new CookieJar();

  async function request(url: string, mode: 'html' | 'json', init?: RequestInit): Promise<Response> {
    const host = new URL(url).host;
    return queue.run(host, async () => {
      await sleep(randomDelayMs());
      return withRetry(`${preset.name} ${mode.toUpperCase()} ${url}`, async () => {
        const cookieHeader = (await jar.getCookieString(url)) || null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), env.HTTP_TIMEOUT_MS);
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
      });
    });
  }

  return {
    name: preset.name,
    async getHtml(url, init) {
      const res = await request(url, 'html', init);
      return res.text();
    },
    async getJson<T>(url: string, init?: RequestInit): Promise<T> {
      const res = await request(url, 'json', init);
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
