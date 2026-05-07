import type { SiteName } from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import type { EmailSender } from './channels/types.js';
import { buildNotifyEmail, type NotifySlot } from './templates.js';

const log = createLogger('notify:dispatcher');

interface PendingRow {
  id: string;
  watch_setting_id: string;
  therapist_id: string;
  date: string;
  start_time: string;
  channel: 'email' | 'line';
  created_at: string;
  watch_settings: {
    user_id: string;
    is_active: boolean;
    deleted_at: string | null;
    users: {
      id: string;
      email: string | null;
      deleted_at: string | null;
    } | null;
  } | null;
  therapists: {
    id: string;
    therapist_id: string;
    name: string;
    salon_id: string;
    salons: {
      name: string;
      shop_id: string;
      site_id: string;
      sites: { name: SiteName } | null;
    } | null;
  } | null;
}

interface UserBatch {
  userId: string;
  userEmail: string;
  rowIds: string[];
  slots: NotifySlot[];
}

export interface DispatcherDeps {
  sender: EmailSender;
}

export interface DispatcherOptions {
  dryRun: boolean;
  usersPerRun: number;
  userIntervalMs: number;
}

export interface DispatcherResult {
  candidates: number; // 集約前の対象ユーザ数
  processedUsers: number; // 今回処理したユーザ数
  succeededUsers: number;
  failedUsers: number;
  skippedUsers: number; // sending 遷移で他プロセスに先取られた等
  succeededRows: number;
  failedRows: number;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPendingRows(): Promise<PendingRow[]> {
  // 一括取得してから Node 側でユーザ単位にグルーピングする。
  // limit は安全弁（極端なバックログ時のメモリ保護）。
  const { data, error } = await supabase
    .from('notification_logs')
    .select(
      `id, watch_setting_id, therapist_id, date, start_time, channel, created_at,
       watch_settings!inner(
         user_id, is_active, deleted_at,
         users!inner(id, email, deleted_at)
       ),
       therapists!inner(
         id, therapist_id, name, salon_id,
         salons!inner(name, shop_id, site_id, sites!inner(name))
       )`,
    )
    .eq('status', 'pending')
    .eq('channel', 'email')
    .is('watch_settings.deleted_at', null)
    .eq('watch_settings.is_active', true)
    .is('watch_settings.users.deleted_at', null)
    .not('watch_settings.users.email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`Failed to fetch pending notification_logs: ${error.message}`);
  }

  return (data ?? []) as unknown as PendingRow[];
}

/**
 * 渡された user_id 集合のうち、サブスクが有効な user_id だけを返す。
 * enqueue_notifications 側でも絞り込んでいるが、念のため dispatcher でも再判定する。
 */
async function filterActiveSubscribers(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id, status, current_period_end')
    .in('user_id', userIds);
  if (error) {
    log.warn('Failed to fetch subscriptions for filter', {
      error: error.message,
    });
    // サブスク情報を取れない場合は安全側に倒して全員除外
    return new Set();
  }
  const now = Date.now();
  const active = new Set<string>();
  for (const row of (data ?? []) as Array<{
    user_id: string;
    status: string;
    current_period_end: string | null;
  }>) {
    if (['trialing', 'active', 'past_due'].includes(row.status)) {
      active.add(row.user_id);
      continue;
    }
    if (
      row.status === 'canceled' &&
      row.current_period_end &&
      new Date(row.current_period_end).getTime() > now
    ) {
      active.add(row.user_id);
    }
  }
  return active;
}

function rowToSlot(row: PendingRow): NotifySlot | null {
  const therapist = row.therapists;
  const salon = therapist?.salons ?? null;
  const site = salon?.sites ?? null;
  if (!therapist || !salon || !site) return null;
  return {
    therapistId: therapist.therapist_id,
    therapistName: therapist.name,
    salonName: salon.name ?? null,
    site: site.name,
    shopId: salon.shop_id,
    date: row.date,
    startTime: row.start_time,
  };
}

function groupByUser(rows: PendingRow[]): UserBatch[] {
  const map = new Map<string, UserBatch>();
  for (const row of rows) {
    const watch = row.watch_settings;
    const user = watch?.users ?? null;
    if (!watch || !user || !user.email) continue;

    const slot = rowToSlot(row);
    if (!slot) continue;

    const existing = map.get(user.id);
    if (existing) {
      existing.rowIds.push(row.id);
      existing.slots.push(slot);
    } else {
      map.set(user.id, {
        userId: user.id,
        userEmail: user.email,
        rowIds: [row.id],
        slots: [slot],
      });
    }
  }
  return Array.from(map.values());
}

async function transitionToSending(
  rowIds: string[],
): Promise<string[]> {
  const { data, error } = await supabase
    .from('notification_logs')
    .update({
      status: 'sending',
      last_attempted_at: new Date().toISOString(),
    })
    .in('id', rowIds)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    throw new Error(`Failed to transition rows to sending: ${error.message}`);
  }
  // attempt_count はサーバー側で増加させたいので別 RPC でも良いが、MVP では
  // application 側でインクリメントせず、後段の sent/failed 更新時にまとめて
  // 反映する（ここでは last_attempted_at のみ更新）。
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function markSent(
  rowIds: string[],
  emailId: string | null,
): Promise<void> {
  if (rowIds.length === 0) return;
  const update: Record<string, unknown> = {
    status: 'sent',
    sent_at: new Date().toISOString(),
    error: null,
  };
  if (emailId) {
    update.email_id = emailId;
  }
  const { error } = await supabase
    .from('notification_logs')
    .update(update)
    .in('id', rowIds);
  if (error) {
    throw new Error(`Failed to mark rows as sent: ${error.message}`);
  }
}

/**
 * 送信したメール本文のスナップショットを notification_emails に保存する。
 * インボックス画面（/notifications）で 1 メール = 1 カードで表示するための親レコード。
 * 失敗してもメール送信自体には影響しないよう、呼び出し側で吸収する。
 */
async function recordEmailSnapshot(args: {
  userId: string;
  subject: string;
  text: string;
  html: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('notification_emails')
    .insert({
      user_id: args.userId,
      subject: args.subject,
      body_text: args.text,
      body_html: args.html,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) {
    log.warn('Failed to record notification_emails', {
      user_id: args.userId,
      error: error?.message,
    });
    return null;
  }
  return (data as { id: string }).id;
}

async function markFailed(rowIds: string[], message: string): Promise<void> {
  if (rowIds.length === 0) return;
  const { error } = await supabase
    .from('notification_logs')
    .update({
      status: 'failed',
      error: message.slice(0, 1000),
    })
    .in('id', rowIds);
  if (error) {
    log.warn('Failed to mark rows as failed', { error: error.message });
  }
}

async function incrementAttemptCount(rowIds: string[]): Promise<void> {
  if (rowIds.length === 0) return;
  // PostgREST 単体では数値カラムのインクリメントができないため、
  // 取得 → +1 → 更新の素朴な実装でよい。MVP では並行実行を想定しないので
  // race condition は無視する。失敗してもログに残るので致命ではない。
  const { data, error } = await supabase
    .from('notification_logs')
    .select('id, attempt_count')
    .in('id', rowIds);
  if (error || !data) {
    log.warn('Failed to read attempt_count for increment', {
      error: error?.message,
    });
    return;
  }
  for (const row of data as { id: string; attempt_count: number }[]) {
    await supabase
      .from('notification_logs')
      .update({ attempt_count: (row.attempt_count ?? 0) + 1 })
      .eq('id', row.id);
  }
}

export async function dispatchEmailNotifications(
  deps: DispatcherDeps,
  options: DispatcherOptions,
): Promise<DispatcherResult> {
  const rows = await fetchPendingRows();
  const batches = groupByUser(rows);

  const result: DispatcherResult = {
    candidates: batches.length,
    processedUsers: 0,
    succeededUsers: 0,
    failedUsers: 0,
    skippedUsers: 0,
    succeededRows: 0,
    failedRows: 0,
  };

  if (batches.length === 0) {
    log.info('No pending email notifications');
    return result;
  }

  // サブスクが有効でないユーザを除外（多重防御）
  const activeUserIds = await filterActiveSubscribers(
    batches.map((b) => b.userId),
  );
  const eligibleBatches = batches.filter((b) => activeUserIds.has(b.userId));
  const dropped = batches.length - eligibleBatches.length;
  if (dropped > 0) {
    log.info('Dropped batches for non-subscribers', { dropped });
  }
  if (eligibleBatches.length === 0) {
    return result;
  }

  shuffleInPlace(eligibleBatches);
  const targets = eligibleBatches.slice(0, options.usersPerRun);
  result.processedUsers = targets.length;

  log.info('Dispatch plan', {
    total_pending_users: batches.length,
    eligible_users: eligibleBatches.length,
    processing_users: targets.length,
    users_per_run: options.usersPerRun,
    dry_run: options.dryRun,
  });

  for (let i = 0; i < targets.length; i++) {
    const batch = targets[i]!;
    const { subject, text, html } = buildNotifyEmail(batch.slots);

    if (options.dryRun) {
      log.info('[dry-run] would send', {
        user_id: batch.userId,
        to: batch.userEmail,
        subject,
        slot_count: batch.slots.length,
        row_ids: batch.rowIds,
      });
      result.succeededUsers += 1;
      result.succeededRows += batch.rowIds.length;
      continue;
    }

    let sendingIds: string[];
    try {
      sendingIds = await transitionToSending(batch.rowIds);
    } catch (err) {
      log.error('Failed to lock rows for user', {
        user_id: batch.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failedUsers += 1;
      continue;
    }

    if (sendingIds.length === 0) {
      log.info('Skip user because rows were already taken by another worker', {
        user_id: batch.userId,
      });
      result.skippedUsers += 1;
      continue;
    }

    await incrementAttemptCount(sendingIds);

    try {
      await deps.sender.send({
        to: batch.userEmail,
        subject,
        text,
        html,
      });
      const emailId = await recordEmailSnapshot({
        userId: batch.userId,
        subject,
        text,
        html,
      });
      await markSent(sendingIds, emailId);
      result.succeededUsers += 1;
      result.succeededRows += sendingIds.length;
      log.info('Sent', {
        user_id: batch.userId,
        to: batch.userEmail,
        slot_count: sendingIds.length,
        email_id: emailId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(sendingIds, message);
      result.failedUsers += 1;
      result.failedRows += sendingIds.length;
      log.error('Send failed', {
        user_id: batch.userId,
        to: batch.userEmail,
        error: message,
      });
    }

    if (i < targets.length - 1 && options.userIntervalMs > 0) {
      await sleep(options.userIntervalMs);
    }
  }

  return result;
}
