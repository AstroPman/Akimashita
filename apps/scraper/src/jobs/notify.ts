import { createLogger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import {
  dispatchEmailNotifications,
  type DispatcherOptions,
} from '../notifications/dispatcher.js';
import { createResendEmailSender } from '../notifications/channels/email_resend.js';
import type {
  BatchSendResultItem,
  EmailSender,
} from '../notifications/channels/types.js';

const log = createLogger('job:notify');

export interface NotifyJobOptions {
  dryRun?: boolean;
  usersPerRun?: number;
}

class NoopEmailSender implements EmailSender {
  async send(): Promise<void> {
    // dry-run 用ダミー。dispatcher 側でも dry-run 分岐があるが、
    // 万一ここまで到達した場合に副作用を出さないようにする。
  }
  async sendBatch(messages: { to: string }[]): Promise<BatchSendResultItem[]> {
    // dry-run 用ダミー。すべて成功扱いで返す。
    return messages.map(() => ({ ok: true }));
  }
}

export async function runNotifyJob(opts: NotifyJobOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const usersPerRun = opts.usersPerRun ?? env.NOTIFY_USERS_PER_RUN;

  const sender: EmailSender = dryRun ? new NoopEmailSender() : createResendEmailSender();

  const dispatcherOptions: DispatcherOptions = {
    dryRun,
    usersPerRun,
    batchSize: env.NOTIFY_BATCH_SIZE,
    interBatchDelayMs: env.NOTIFY_USER_INTERVAL_MS,
  };

  const result = await dispatchEmailNotifications({ sender }, dispatcherOptions);

  log.info('Stage 4 complete', {
    dry_run: dryRun,
    candidates: result.candidates,
    processed_users: result.processedUsers,
    succeeded_users: result.succeededUsers,
    failed_users: result.failedUsers,
    skipped_users: result.skippedUsers,
    succeeded_rows: result.succeededRows,
    failed_rows: result.failedRows,
  });
}
