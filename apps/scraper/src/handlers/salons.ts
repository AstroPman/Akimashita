import type { Context, Handler } from 'aws-lambda';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handler:salons');

interface Result {
  ok: boolean;
  stage: 'salons';
}

// Stage 1 (salons) は MVP では seed.sql で手動管理。
// Lambda として枠だけ用意し、自動化対応時に runSalonsJob を呼ぶ。
export const handler: Handler<unknown, Result> = async (
  _event,
  _context: Context,
) => {
  log.warn('Stage 1 (salons) is not implemented yet. Manage seed.sql manually.');
  throw new Error('Stage 1 (salons) is not implemented yet.');
};
