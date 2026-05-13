import type { SiteName } from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import type {
  BatchSendResultItem,
  EmailMessage,
  EmailSender,
} from './channels/types.js';
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

/**
 * バッチ送信処理に渡る、ロック済みかつメール本文を構築済みのユニット。
 * 元の UserBatch から、別ワーカーに先取られた row を除外したサブセットで作る。
 */
interface PreparedBatch {
  userId: string;
  userEmail: string;
  lockedRowIds: string[];
  message: EmailMessage;
}

export interface DispatcherDeps {
  sender: EmailSender;
}

export interface DispatcherOptions {
  dryRun: boolean;
  usersPerRun: number;
  /**
   * Resend Batch API の 1 リクエストに詰めるユーザ数の上限。
   * Resend 側の上限は 100。
   */
  batchSize: number;
  /**
   * チャンク（= 1 batch HTTP リクエスト）の間に挟む待機時間。
   * 0 で待機なし。Resend のレート制限と相談。
   */
  interBatchDelayMs: number;
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

/**
 * 渡された rowIds をまとめて 'sending' に遷移させる。`status='pending'` の WHERE 句で
 * 楽観ロックが効くため、複数ワーカーが同時に走っても 1 行は 1 ワーカーにのみ確保される。
 * 戻り値はロックを取得できた rowId の Set。
 */
async function bulkTransitionToSending(
  rowIds: string[],
): Promise<Set<string>> {
  if (rowIds.length === 0) return new Set();
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
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

async function markSent(
  rowIds: string[],
  emailSnapshotId: string | null,
): Promise<void> {
  if (rowIds.length === 0) return;
  const update: Record<string, unknown> = {
    status: 'sent',
    sent_at: new Date().toISOString(),
    error: null,
  };
  if (emailSnapshotId) {
    update.email_id = emailSnapshotId;
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

/**
 * 送信対象 row の attempt_count を 1 ずつ加算する。MVP では並行実行を想定せず
 * read → +1 → write の素朴な実装。失敗してもログに残るので致命ではない。
 */
async function incrementAttemptCount(rowIds: string[]): Promise<void> {
  if (rowIds.length === 0) return;
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
  await Promise.all(
    (data as { id: string; attempt_count: number }[]).map((row) =>
      supabase
        .from('notification_logs')
        .update({ attempt_count: (row.attempt_count ?? 0) + 1 })
        .eq('id', row.id),
    ),
  );
}

/**
 * UserBatch から「ロック済み row のみで構成された PreparedBatch」を作る。
 * lockedRowIds が 0 件のユーザは送信対象外として null を返す（呼び出し側で skipped カウント）。
 */
function prepareBatch(
  batch: UserBatch,
  lockedSet: Set<string>,
): PreparedBatch | null {
  const lockedRowIds: string[] = [];
  const lockedSlots: NotifySlot[] = [];
  for (let i = 0; i < batch.rowIds.length; i++) {
    const rowId = batch.rowIds[i]!;
    if (lockedSet.has(rowId)) {
      lockedRowIds.push(rowId);
      lockedSlots.push(batch.slots[i]!);
    }
  }
  if (lockedRowIds.length === 0) return null;

  const { subject, text, html } = buildNotifyEmail(lockedSlots);
  return {
    userId: batch.userId,
    userEmail: batch.userEmail,
    lockedRowIds,
    message: { to: batch.userEmail, subject, text, html },
  };
}

/**
 * 送信成功 1 ユーザ分の事後処理。スナップショット保存 + sent 遷移を順に行う。
 * snapshot 保存に失敗しても sent 遷移は実施する（メール自体は届いているため）。
 */
async function finalizeSent(prepared: PreparedBatch): Promise<void> {
  const snapshotId = await recordEmailSnapshot({
    userId: prepared.userId,
    subject: prepared.message.subject,
    text: prepared.message.text,
    html: prepared.message.html,
  });
  await markSent(prepared.lockedRowIds, snapshotId);
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

  // 送信順による「早い者勝ち」の不公平を緩和するため、毎回シャッフルしてから
  // 上限まで取る。チャンク内は同時送信になるが、チャンクをまたぐ順序のバイアスは消える。
  shuffleInPlace(eligibleBatches);
  const targets = eligibleBatches.slice(0, options.usersPerRun);
  result.processedUsers = targets.length;

  log.info('Dispatch plan', {
    total_pending_users: batches.length,
    eligible_users: eligibleBatches.length,
    processing_users: targets.length,
    users_per_run: options.usersPerRun,
    batch_size: options.batchSize,
    dry_run: options.dryRun,
  });

  // dry-run はロックも送信もせず、送信予定の内訳をログするだけで終わる。
  if (options.dryRun) {
    for (const batch of targets) {
      const { subject } = buildNotifyEmail(batch.slots);
      log.info('[dry-run] would send', {
        user_id: batch.userId,
        to: batch.userEmail,
        subject,
        slot_count: batch.slots.length,
        row_ids: batch.rowIds,
      });
      result.succeededUsers += 1;
      result.succeededRows += batch.rowIds.length;
    }
    return result;
  }

  // すべての送信対象 row を 1 リクエストでまとめてロックする。
  // 別ワーカーに先取られた row はロックセットに含まれず、prepareBatch でスキップされる。
  const allRowIds = targets.flatMap((b) => b.rowIds);
  let lockedSet: Set<string>;
  try {
    lockedSet = await bulkTransitionToSending(allRowIds);
  } catch (err) {
    log.error('Bulk transition to sending failed; abort run', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const prepared: PreparedBatch[] = [];
  for (const batch of targets) {
    const p = prepareBatch(batch, lockedSet);
    if (!p) {
      result.skippedUsers += 1;
      log.info('Skip user because rows were already taken by another worker', {
        user_id: batch.userId,
      });
      continue;
    }
    prepared.push(p);
  }

  if (prepared.length === 0) {
    return result;
  }

  // attempt_count はロック直後にまとめて加算する。失敗しても致命ではない。
  await incrementAttemptCount(prepared.flatMap((p) => p.lockedRowIds));

  // チャンク（最大 batchSize 件）に分割して順番にバッチ送信する。
  // チャンク内のユーザ間は Resend 側の処理がほぼ同時刻で完了するため、
  // 「最初のユーザ」と「最後のユーザ」の到達差は実質ゼロになる。
  for (let start = 0; start < prepared.length; start += options.batchSize) {
    const chunk = prepared.slice(start, start + options.batchSize);
    const chunkIndex = Math.floor(start / options.batchSize) + 1;
    const totalChunks = Math.ceil(prepared.length / options.batchSize);

    log.info('Sending chunk', {
      chunk_index: chunkIndex,
      total_chunks: totalChunks,
      users_in_chunk: chunk.length,
    });

    let chunkResults: BatchSendResultItem[];
    try {
      chunkResults = await deps.sender.sendBatch(chunk.map((p) => p.message));
    } catch (err) {
      // sendBatch 自体が例外を投げるケース（ネットワーク断等）。
      // チャンク内全ユーザを failed 扱いにする。
      const message = err instanceof Error ? err.message : String(err);
      log.error('sendBatch threw; mark whole chunk as failed', {
        chunk_index: chunkIndex,
        error: message,
      });
      await Promise.all(
        chunk.map(async (p) => {
          await markFailed(p.lockedRowIds, message);
          result.failedUsers += 1;
          result.failedRows += p.lockedRowIds.length;
        }),
      );
      continue;
    }

    // 各ユーザの結果を並列で確定させる（成功は snapshot + markSent、失敗は markFailed）。
    // Supabase へは PostgREST 経由なので並列実行で問題ない。
    await Promise.all(
      chunk.map(async (p, i) => {
        const r = chunkResults[i];
        if (r?.ok) {
          try {
            await finalizeSent(p);
            result.succeededUsers += 1;
            result.succeededRows += p.lockedRowIds.length;
            log.info('Sent', {
              user_id: p.userId,
              to: p.userEmail,
              slot_count: p.lockedRowIds.length,
              provider_message_id: r.providerMessageId ?? null,
            });
          } catch (err) {
            // メールは送信成功しているが、DB 側の sent 記録に失敗。
            // notification_logs は 'sending' のまま残るが、unique 制約により再送はされない。
            // ここでは failed としては扱わず、エラーログだけ残す。
            log.error('Failed to finalize sent state', {
              user_id: p.userId,
              error: err instanceof Error ? err.message : String(err),
            });
            result.succeededUsers += 1;
            result.succeededRows += p.lockedRowIds.length;
          }
        } else {
          const errorMessage = r?.error ?? 'Unknown send failure';
          await markFailed(p.lockedRowIds, errorMessage);
          result.failedUsers += 1;
          result.failedRows += p.lockedRowIds.length;
          log.error('Send failed', {
            user_id: p.userId,
            to: p.userEmail,
            error: errorMessage,
          });
        }
      }),
    );

    if (start + options.batchSize < prepared.length && options.interBatchDelayMs > 0) {
      await sleep(options.interBatchDelayMs);
    }
  }

  return result;
}
