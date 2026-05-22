import type { Context, Handler } from 'aws-lambda';
import type { SiteName } from '@alimashita/shared';
import { runTherapistsJob } from '../jobs/therapists.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:therapists');

/**
 * Stage 2 (therapists) ハンドラの入力。
 *
 * site / exclude_site / max_per_site は eyoyaku のように Bot 検知が厳しいサイトを
 * 別ジョブで分割実行するための運用フィルタ。EventBridge Scheduler / 手動 Invoke / SFN から
 * input で渡す JSON をそのまま受け取る。
 *
 * 例:
 *   通常 (1 日 1 回 / eyoyaku 除外):  `{ "only_unsynced": false, "exclude_site": ["eyoyaku"] }`
 *   eyoyaku 専用ブートストラップ:    `{ "only_unsynced": true, "site": ["eyoyaku"], "max_per_site": 20 }`
 */
interface TherapistsEvent {
  /** true で last_synced_at IS NULL のサロン（未スクレイピング）のみを対象にする。 */
  onlyUnsynced?: boolean;
  /** 対象サイトを限定。配列でも単一文字列でも受ける。 */
  site?: SiteName | SiteName[];
  /** 対象サイトから除外。配列でも単一文字列でも受ける。 */
  exclude_site?: SiteName | SiteName[];
  /** 1 ジョブで site あたりに処理する最大サロン数 (eyoyaku の段階的ブートストラップ用)。 */
  max_per_site?: number;
}

interface Result {
  ok: boolean;
  stage: 'therapists';
}

function toArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export const handler: Handler<TherapistsEvent | undefined, Result> = async (
  event,
  _context: Context,
) => {
  const onlyUnsynced = event?.onlyUnsynced ?? false;
  const onlySites = toArray(event?.site);
  const excludeSites = toArray(event?.exclude_site);
  const maxPerSite = event?.max_per_site;

  log.info('Stage 2 (therapists) handler invoked', {
    only_unsynced: onlyUnsynced,
    only_sites: onlySites,
    exclude_sites: excludeSites,
    max_per_site: maxPerSite,
  });
  await runTherapistsJob({
    onlyUnsynced,
    onlySites,
    excludeSites,
    maxPerSite,
  });
  return { ok: true, stage: 'therapists' };
};
