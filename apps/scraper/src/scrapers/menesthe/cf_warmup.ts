import {
  chromium,
  type Browser,
  type BrowserContext,
  type Cookie as PlaywrightCookie,
  type Page,
} from 'playwright-core';
import { env } from '../../lib/env.js';
import { httpMenesthe, type InjectedCookie } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const log = createLogger('menesthe:cf_warmup');

const HOME_URL = 'https://men-esthe.jp/';
const CHALLENGE_TIMEOUT_MS = 60_000;

/**
 * Cloudflare は Node / undici の TLS 指紋でも弾く。
 * Playwright の `APIRequestContext` も内部 undici のため同じ壁にぶつかる。
 * そのため warmup 後の通信は **ページ origin 上の window.fetch** を使う。
 */
export type MenestheWarmupHandle = {
  dispose: () => Promise<void>;
};

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

/** ブラウザの fetch では設定できない / すべきでないヘッダ。 */
function sanitizeBrowserFetchHeaders(headers: Record<string, string>): Record<string, string> {
  // createHttp が付ける UA / Sec-Fetch / Cookie / Accept-Encoding 等は
  // ページ内 fetch ではブラウザが付けるものを使った方が CF 通過率が高い。
  // JSON API 用の Accept / X-Requested-With だけ残す。
  const allow = new Set(['accept', 'content-type', 'x-requested-with']);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!allow.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

function findFullChromiumExecutable(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (fromEnv) return fromEnv;

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(process.env.HOME ?? '', 'Library/Caches/ms-playwright'),
    path.join(process.env.HOME ?? '', '.cache/ms-playwright'),
    '/opt/ms-playwright',
  ].filter((p): p is string => !!p && p.length > 0);

  const candidates: string[] = [];
  for (const root of roots) {
    try {
      if (!statSync(root).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const ent of readdirSync(root)) {
      if (!ent.startsWith('chromium-') || ent.includes('headless')) continue;
      walkExecutables(path.join(root, ent), candidates);
    }
  }
  return (
    candidates.find((p) => /Chrome for Testing|[/\\]chrome$/i.test(p)) ?? candidates[0]
  );
}

function walkExecutables(dir: string, out: string[], depth = 0): void {
  if (depth > 8) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkExecutables(full, out, depth + 1);
      continue;
    }
    if (
      name === 'chrome' ||
      name === 'chromium' ||
      name === 'Google Chrome for Testing' ||
      name === 'chrome-headless-shell' ||
      name === 'headless_shell'
    ) {
      out.push(full);
    }
  }
}

function resolveLaunchOptions(): {
  executablePath?: string;
  args: string[];
} {
  const executablePath = findFullChromiumExecutable();
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
  ];
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    args.push('--single-process', '--no-zygote');
  }
  return { executablePath, args };
}

function toInjectedCookie(c: PlaywrightCookie): InjectedCookie {
  const sameSite =
    c.sameSite === 'None' || c.sameSite === 'Lax' || c.sameSite === 'Strict'
      ? c.sameSite
      : undefined;
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: typeof c.expires === 'number' && c.expires > 0 ? c.expires : undefined,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite,
  };
}

/**
 * page 上の window.fetch を Node の fetch 互換でラップする。
 * Cookie / TLS はブラウザ本体と同一。
 */
function buildPageFetch(page: Page): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = sanitizeBrowserFetchHeaders(headersToRecord(init?.headers));
    const body =
      typeof init?.body === 'string'
        ? init.body
        : init?.body == null
          ? null
          : Buffer.from(
              await new Response(init.body as BodyInit).arrayBuffer(),
            ).toString('utf8');

    const result = await page.evaluate(
      async (args: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body: string | null;
      }) => {
        const res = await fetch(args.url, {
          method: args.method,
          headers: args.headers,
          body: args.body,
          credentials: 'include',
          redirect: 'follow',
        });
        const ab = await res.arrayBuffer();
        const bytes = Array.from(new Uint8Array(ab));
        const hdrs: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          hdrs[k] = v;
        });
        return {
          status: res.status,
          statusText: res.statusText,
          headers: hdrs,
          bytes,
        };
      },
      { url, method, headers, body },
    );

    return new Response(new Uint8Array(result.bytes), {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
  }) as typeof fetch;
}

/**
 * Cloudflare チャレンジを Playwright で解き、以降の httpMenesthe 通信を
 * ページ内 fetch 経由に切り替える。戻り値の dispose() で元に戻しブラウザを閉じる。
 */
export async function warmMenestheSession(): Promise<MenestheWarmupHandle> {
  const { executablePath, args } = resolveLaunchOptions();
  log.info('Starting Cloudflare warmup', {
    executable_path: executablePath ?? '(playwright default)',
    user_agent: env.USER_AGENT.slice(0, 64),
  });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args,
    });
    context = await browser.newContext({
      userAgent: env.USER_AGENT,
      locale: 'ja-JP',
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    await page.goto(HOME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CHALLENGE_TIMEOUT_MS,
    });

    await page.waitForFunction(
      () => !document.title.toLowerCase().includes('just a moment'),
      null,
      { timeout: CHALLENGE_TIMEOUT_MS },
    );

    const title = await page.title();
    const cookies = await context.cookies(HOME_URL);
    log.info('Challenge cleared', {
      title: title.slice(0, 80),
      cookie_count: cookies.length,
      cookie_names: cookies.map((c) => c.name),
      has_cf_clearance: cookies.some((c) => c.name === 'cf_clearance'),
    });

    // Jar には参考として載せるが、実通信は page.fetch (Cookie ヘッダはページ側) を使う。
    httpMenesthe.rotateCookies();
    await httpMenesthe.setCookies(HOME_URL, cookies.map(toInjectedCookie));
    httpMenesthe.setFetchImpl(buildPageFetch(page));

    // getHtml 経由だと NAVIGATION_HEADERS が付きすぎて再チャレンジされることがある。
    // ページ内の同一オリジン fetch で通過を確認する。
    const probe = await page.evaluate(async () => {
      const res = await fetch('/therapistlist.php?id=6441&more&p=0', {
        credentials: 'include',
        headers: { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const text = await res.text();
      return { status: res.status, prefix: text.slice(0, 80), isArray: text.trimStart().startsWith('[') };
    });
    if (probe.status !== 200 || !probe.isArray) {
      throw new Error(
        `In-page therapistlist probe failed (status=${probe.status}, prefix=${probe.prefix})`,
      );
    }
    log.info('Cloudflare warmup verified via in-page fetch', probe);
    const activeBrowser = browser;
    const activeContext = context;
    browser = null;
    context = null;

    return {
      dispose: async () => {
        httpMenesthe.setFetchImpl(null);
        httpMenesthe.rotateCookies();
        await activeContext.close().catch(() => undefined);
        await activeBrowser.close().catch(() => undefined);
        log.info('Cloudflare warmup disposed');
      },
    };
  } catch (err) {
    httpMenesthe.setFetchImpl(null);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    throw err;
  }
}
