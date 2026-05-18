import type { Context, Handler } from 'aws-lambda';
import { runAvailabilityJob } from '../jobs/availability.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:availability_research');

interface Result {
  ok: boolean;
  stage: 'availability_research';
}

/**
 * Stage 3 (availability) の research モード専用ハンドラ。
 *
 * `salons.research_enabled = true` のサロン配下のセラピストのうち、
 * watch_settings に登録されていないものだけを回し、通知パスはスキップする。
 * watch_settings 配下のセラピストは毎分実行の本流 availability Lambda に任せる
 * (research が先回りすると差分検知 (previous_is_available 遷移 / 新規 INSERT) を
 * 奪ってしまい通知漏れになるため、責任分担を明確に分ける)。
 *
 * 1 ジョブが数分かかるケースがあるため、Lambda 側の timeout を 900s 程度に
 * 設定すること (infra/aws/modules/scraper/main.tf の stages を参照)。
 */
export const handler: Handler<unknown, Result> = async (
  _event,
  _context: Context,
) => {
  log.info('Stage 3 (availability_research) handler invoked');
  await runAvailabilityJob({ mode: 'research' });
  return { ok: true, stage: 'availability_research' };
};
