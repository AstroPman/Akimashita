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
 * `salons.research_enabled = true` のサロン配下のセラピストだけを回し、
 * 通知パスはスキップする。本流の availability Lambda とは別 Schedule で動かす前提。
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
