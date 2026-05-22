import type { Context, Handler } from 'aws-lambda';
import { runOfficialShiftsJob } from '../jobs/official_shifts.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:official_shifts');

interface Result {
  ok: boolean;
  stage: 'official_shifts';
}

export const handler: Handler<unknown, Result> = async (
  _event,
  _context: Context,
) => {
  log.info('Stage 5 (official_shifts) handler invoked');
  // watch_settings 配下のセラピストのうち external_therapists.therapist_url が
  // 解決済みのものだけを対象にする。Layer 2 (shift_announced) の発火源。
  await runOfficialShiftsJob();
  return { ok: true, stage: 'official_shifts' };
};
