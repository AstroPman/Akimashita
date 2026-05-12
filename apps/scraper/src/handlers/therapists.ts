import type { Context, Handler } from 'aws-lambda';
import { runTherapistsJob } from '../jobs/therapists.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:therapists');

interface TherapistsEvent {
  /** true で last_synced_at IS NULL のサロン（未スクレイピング）のみを対象にする。 */
  onlyUnsynced?: boolean;
}

interface Result {
  ok: boolean;
  stage: 'therapists';
}

export const handler: Handler<TherapistsEvent | undefined, Result> = async (
  event,
  _context: Context,
) => {
  const onlyUnsynced = event?.onlyUnsynced ?? false;

  log.info('Stage 2 (therapists) handler invoked', { only_unsynced: onlyUnsynced });
  await runTherapistsJob({ onlyUnsynced });
  return { ok: true, stage: 'therapists' };
};
