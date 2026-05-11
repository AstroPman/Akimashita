import type { Context, Handler } from 'aws-lambda';
import { runTherapistsJob } from '../jobs/therapists.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:therapists');

interface Result {
  ok: boolean;
  stage: 'therapists';
}

export const handler: Handler<unknown, Result> = async (
  _event,
  _context: Context,
) => {
  log.info('Stage 2 (therapists) handler invoked');
  await runTherapistsJob();
  return { ok: true, stage: 'therapists' };
};
