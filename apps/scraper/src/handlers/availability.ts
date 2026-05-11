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
  await runAvailabilityJob();
  return { ok: true, stage: 'availability' };
};
