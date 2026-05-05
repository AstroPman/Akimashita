/**
 * grow-appt.com の内部APIを特定するための調査スクリプト。
 * Playwright で実ブラウザを起動し、SPAが叩いているXHR/Fetchを記録する。
 *
 * 実行:
 *   npm run inspect:grow -- staff <SID>
 *   npm run inspect:grow -- status <SID> <staff_no>
 *
 *   例: npm run inspect:grow -- status u15Vr2S7zV 116452
 */
import { chromium, type Request, type Response } from 'playwright';

type Mode = 'staff' | 'status';

interface Args {
  mode: Mode;
  sid: string;
  staffNo?: string;
}

function parseArgs(): Args {
  const [, , maybeMode, ...rest] = process.argv;
  const mode = (maybeMode === 'status' ? 'status' : 'staff') as Mode;
  if (mode === 'status') {
    const [sid, staffNo] = rest;
    if (!sid || !staffNo) {
      throw new Error('usage: inspect:grow -- status <SID> <staff_no>');
    }
    return { mode, sid, staffNo };
  }
  const [sid] = rest.length > 0 ? rest : ['u15Vr2S7zV'];
  return { mode: 'staff', sid: sid ?? 'u15Vr2S7zV' };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const url =
    args.mode === 'staff'
      ? `https://grow-appt.com/reserve/order?SID=${args.sid}&page=staff`
      : `https://grow-appt.com/reserve/order?SID=${args.sid}&page=date&staff_no=${args.staffNo}`;

  console.log(`[inspect:grow] mode=${args.mode} url=${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  page.on('request', (req: Request) => {
    const reqUrl = req.url();
    if (reqUrl.includes('/reserve/api/')) {
      console.log(`>>> ${req.method()} ${reqUrl}`);
    }
  });

  page.on('response', async (res: Response) => {
    const reqUrl = res.url();
    if (!reqUrl.includes('/reserve/api/')) return;
    const ct = res.headers()['content-type'] ?? '';
    let bodyPreview = '';
    if (ct.includes('json')) {
      try {
        const json = await res.json();
        bodyPreview = JSON.stringify(json).slice(0, 4000);
      } catch {
        bodyPreview = '<unparseable json>';
      }
    }
    console.log(`<<< ${res.status()} ${reqUrl} ct=${ct}`);
    if (bodyPreview) console.log(`    body: ${bodyPreview}`);
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3_000);

  await browser.close();
  console.log('[inspect:grow] done');
}

main().catch((err) => {
  console.error('[inspect:grow] error:', err);
  process.exitCode = 1;
});
