import type { Context, Handler } from 'aws-lambda';
import { createLogger } from '../lib/logger.js';
import {
  runExternalSalonsJob,
  type ExternalSalonsPhase,
} from '../jobs/external_salons.js';

const log = createLogger('handler:salons');

interface SalonsEvent {
  /** 'areas' | 'discover' | 'details' | 'bookings' | 'all'。デフォルト 'all'。 */
  phase?: ExternalSalonsPhase;
  /** details / bookings フェーズの 1 回あたり処理上限。 */
  limit?: number;
  /** 詳細を再取得するしきい値 (日数)。 */
  staleAfterDays?: number;
  /** Lambda 全体の予算 (ms)。指定なしで 13 分。 */
  budgetMs?: number;
}

interface Result {
  ok: boolean;
  stage: 'salons';
}

// Stage 1 (salons): 外部ポータル(men-esthe.jp) をクロールして
// reference DB (external_areas / external_salons / external_salon_bookings)
// を更新する。我々の salons テーブルとの結合は後続 MR (PR-β) で実装する。
export const handler: Handler<SalonsEvent | undefined, Result> = async (
  event,
  _context: Context,
) => {
  const opts = {
    phase: event?.phase ?? 'all',
    limit: event?.limit,
    staleAfterDays: event?.staleAfterDays,
    budgetMs: event?.budgetMs,
  };
  log.info('Stage 1 (salons) handler invoked', opts);
  await runExternalSalonsJob(opts);
  return { ok: true, stage: 'salons' };
};
