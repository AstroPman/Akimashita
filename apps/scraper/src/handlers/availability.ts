import type { Context, Handler } from 'aws-lambda';
import { runAvailabilityJob } from '../jobs/availability.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:availability');

interface Result {
  ok: boolean;
  stage: 'availability';
}

export const handler: Handler<unknown, Result> = async (
  _event,
  _context: Context,
) => {
  log.info('Stage 3 (availability) handler invoked');
  // watch_settings 配下のセラピストのみを対象にする本流モード。
  // 研究目的の `salons.research_enabled = true` は `availability_research` ハンドラが別途処理する。
  await runAvailabilityJob({ mode: 'watch' });
  return { ok: true, stage: 'availability' };
};
