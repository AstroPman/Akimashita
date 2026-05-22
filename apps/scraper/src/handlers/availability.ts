import type { Context, Handler } from 'aws-lambda';
import type { SiteName } from '@alimashita/shared';
import { runAvailabilityJob } from '../jobs/availability.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:availability');

/**
 * Stage 3 (availability) ハンドラの入力。
 *
 * EventBridge Scheduler が target.input で渡す JSON をそのまま受け取る。
 * site / exclude_site は eyoyaku のように Bot 検知が厳しいサイトを別 Schedule で
 * 分離するための運用フィルタ。詳細は infra/aws/modules/scraper/scheduler.tf を参照。
 *
 * 例:
 *   メイン (1 分間隔):    `{ "exclude_site": ["eyoyaku"] }`
 *   eyoyaku 専用 (5 分):  `{ "site": ["eyoyaku"] }`
 */
interface AvailabilityEvent {
  /** 対象サイトを限定。配列でも単一文字列でも受ける。 */
  site?: SiteName | SiteName[];
  /** 対象サイトから除外。配列でも単一文字列でも受ける。 */
  exclude_site?: SiteName | SiteName[];
}

interface Result {
  ok: boolean;
  stage: 'availability';
}

function toArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export const handler: Handler<AvailabilityEvent | undefined, Result> = async (
  event,
  _context: Context,
) => {
  const onlySites = toArray(event?.site);
  const excludeSites = toArray(event?.exclude_site);

  log.info('Stage 3 (availability) handler invoked', {
    only_sites: onlySites,
    exclude_sites: excludeSites,
  });
  // watch_settings 配下のセラピストのみを対象にする本流モード。
  // 研究目的の `salons.research_enabled = true` は `availability_research` ハンドラが別途処理する。
  await runAvailabilityJob({
    mode: 'watch',
    onlySites,
    excludeSites,
  });
  return { ok: true, stage: 'availability' };
};
