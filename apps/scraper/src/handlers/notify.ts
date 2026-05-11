import type { Context, Handler } from 'aws-lambda';
import { runNotifyJob } from '../jobs/notify.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:notify');

interface NotifyEvent {
  dryRun?: boolean;
  usersPerRun?: number;
}

interface Result {
  ok: boolean;
  stage: 'notify';
}

export const handler: Handler<NotifyEvent | undefined, Result> = async (
  event,
  _context: Context,
) => {
  const dryRun = event?.dryRun ?? false;
  const usersPerRun = event?.usersPerRun;

  log.info('Stage 4 (notify) handler invoked', { dry_run: dryRun, users_per_run: usersPerRun });
  await runNotifyJob({ dryRun, usersPerRun });
  return { ok: true, stage: 'notify' };
};
