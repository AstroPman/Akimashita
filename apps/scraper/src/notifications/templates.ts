import type { SiteName } from '@alimashita/shared';
import { env } from '../lib/env.js';
import { buildReservationUrl } from './reservation_url.js';

export interface NotifySlot {
  therapistId: string;
  therapistName: string;
  salonName: string | null;
  site: SiteName;
  shopId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
}

export interface NotifyEmailContent {
  subject: string;
  text: string;
  html: string;
}

const JST = 'Asia/Tokyo';

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDate(date: string): string {
  // 'YYYY-MM-DD' を JST 0:00 として解釈し ja-JP の M/D（曜）にフォーマット
  const d = new Date(`${date}T00:00:00+09:00`);
  // Intl の出力は "5/10(土)" のように曜日を括弧で返さないため整形する
  // ja-JP の出力例: "5月10日(土)" → そのまま採用
  return dateFormatter.format(d);
}

function formatTime(startTime: string): string {
  // 'HH:mm:ss' を JST として解釈
  const [h = '0', m = '0'] = startTime.split(':');
  const d = new Date(Date.UTC(2000, 0, 1, Number(h), Number(m)));
  // UTC で生成した時刻を JST 表示するとずれるので、固定の JST 時刻として再構築
  const iso = `2000-01-01T${startTime.length === 8 ? startTime : `${startTime}:00`}+09:00`;
  return timeFormatter.format(new Date(iso));
}

interface SlotsByTherapist {
  therapistId: string;
  therapistName: string;
  salonName: string | null;
  site: SiteName;
  shopId: string;
  slots: NotifySlot[];
}

interface SlotRange {
  date: string;
  startTime: string; // 範囲の先頭スロットの開始時刻 (HH:mm:ss)
  endStartTime: string; // 範囲の末尾スロットの開始時刻 (HH:mm:ss)
  count: number;
}

function timeToMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * 同一セラピストのスロット集合を「同一日付内で連続している枠」ごとに範囲化する。
 *
 * 連続性の判定は「その日付内のスロット同士の最小間隔 step」を、そのセラピスト・
 * その日付の典型的な刻み幅とみなして、隣接するスロットの差が step と一致する間は
 * 同じ範囲に束ねる方式。サイト・店舗ごとに刻み幅 (5/10/15/30 分等) が異なるため、
 * 固定値ではなく実データから推定している。
 *
 * 入力 slots は呼び出し側で date, startTime 昇順にソート済みであることを前提とする。
 */
function groupConsecutiveRanges(slots: NotifySlot[]): SlotRange[] {
  const buckets = new Map<string, NotifySlot[]>();
  for (const slot of slots) {
    const list = buckets.get(slot.date);
    if (list) {
      list.push(slot);
    } else {
      buckets.set(slot.date, [slot]);
    }
  }

  const ranges: SlotRange[] = [];
  const dates = Array.from(buckets.keys()).sort();
  for (const date of dates) {
    const dayslots = buckets.get(date)!;
    if (dayslots.length === 1) {
      const only = dayslots[0]!;
      ranges.push({
        date,
        startTime: only.startTime,
        endStartTime: only.startTime,
        count: 1,
      });
      continue;
    }

    let step = Number.POSITIVE_INFINITY;
    for (let i = 1; i < dayslots.length; i++) {
      const diff =
        timeToMinutes(dayslots[i]!.startTime) -
        timeToMinutes(dayslots[i - 1]!.startTime);
      if (diff > 0 && diff < step) step = diff;
    }

    let rangeStart = dayslots[0]!;
    let rangeEnd = dayslots[0]!;
    let rangeCount = 1;

    const flush = () => {
      ranges.push({
        date,
        startTime: rangeStart.startTime,
        endStartTime: rangeEnd.startTime,
        count: rangeCount,
      });
    };

    for (let i = 1; i < dayslots.length; i++) {
      const prev = dayslots[i - 1]!;
      const cur = dayslots[i]!;
      const diff = timeToMinutes(cur.startTime) - timeToMinutes(prev.startTime);
      if (diff === step) {
        rangeEnd = cur;
        rangeCount += 1;
      } else {
        flush();
        rangeStart = cur;
        rangeEnd = cur;
        rangeCount = 1;
      }
    }
    flush();
  }

  return ranges;
}

function formatRangeTime(range: SlotRange): string {
  if (range.count <= 1) {
    return formatTime(range.startTime);
  }
  return `${formatTime(range.startTime)}〜${formatTime(range.endStartTime)}`;
}

function groupByTherapist(slots: NotifySlot[]): SlotsByTherapist[] {
  const map = new Map<string, SlotsByTherapist>();
  for (const slot of slots) {
    const existing = map.get(slot.therapistId);
    if (existing) {
      existing.slots.push(slot);
    } else {
      map.set(slot.therapistId, {
        therapistId: slot.therapistId,
        therapistName: slot.therapistName,
        salonName: slot.salonName,
        site: slot.site,
        shopId: slot.shopId,
        slots: [slot],
      });
    }
  }

  for (const group of map.values()) {
    group.slots.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.startTime < b.startTime ? -1 : 1;
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.therapistName.localeCompare(b.therapistName, 'ja'),
  );
}

function buildSubject(
  slots: NotifySlot[],
  groups: SlotsByTherapist[],
  groupRanges: SlotRange[][],
): string {
  // 全セラピストを通して range が 1 つだけのときは、その range を件名に展開する。
  // 単独枠なら "5月12日(火) 15:00"、連続枠なら "5月12日(火) 15:00〜15:15"。
  const totalRanges = groupRanges.reduce((sum, rs) => sum + rs.length, 0);
  if (totalRanges === 1 && groups.length === 1) {
    const onlyGroup = groups[0]!;
    const onlyRange = groupRanges[0]![0]!;
    return `[akimashita] ${onlyGroup.therapistName} の空きが出ました（${formatDate(
      onlyRange.date,
    )} ${formatRangeTime(onlyRange)}）`;
  }
  return `[akimashita] 空きが出ました（${slots.length}件 / セラピスト${groups.length}名）`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export type PlanTier = 'free' | 'standard' | 'premium';

export interface BuildNotifyEmailOptions {
  /** 受信者のプラン。アップグレード誘導 CTA を出し分けるために使う。 */
  tier?: PlanTier;
}

interface UpsellContent {
  textLines: string[];
  htmlBlock: string;
}

function buildUpsell(tier: PlanTier, baseUrl: string): UpsellContent | null {
  if (tier === 'premium') return null;
  const pricingUrl = `${baseUrl}/pricing?source=email_${tier}`;
  if (tier === 'free') {
    const text = [
      '─ アップグレードのご案内 ─',
      '現在、無料プランの 10 分遅延で通知をお届けしています。',
      'スタンダードプランで 5 分遅延、プレミアムプランなら即時通知。',
      '監視できるセラピスト数もアップグレードで増やせます。',
      `プランを比較する: ${pricingUrl}`,
    ];
    const html =
      '<div style="margin-top:24px;padding:12px 14px;border:1px solid #fcd34d;background:#fffbeb;border-radius:8px;font-size:13px;color:#92400e">' +
      '<strong>アップグレードのご案内</strong>' +
      '<p style="margin:6px 0 4px;color:#92400e">現在、無料プランの 10 分遅延で通知中。スタンダードで 5 分遅延、プレミアムなら即時通知が届きます。</p>' +
      `<p style="margin:6px 0 0"><a href="${escapeHtml(pricingUrl)}" style="color:#92400e;font-weight:bold">プランを比較する</a></p>` +
      '</div>';
    return { textLines: text, htmlBlock: html };
  }
  // standard
  const text = [
    '─ アップグレードのご案内 ─',
    '現在、スタンダードプランの 5 分遅延で通知をお届けしています。',
    'プレミアムプランなら即時通知＋監視数も無制限。',
    `プランを比較する: ${pricingUrl}`,
  ];
  const html =
    '<div style="margin-top:24px;padding:12px 14px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:8px;font-size:13px;color:#3730a3">' +
    '<strong>アップグレードのご案内</strong>' +
    '<p style="margin:6px 0 4px;color:#3730a3">現在、5 分遅延で通知中。プレミアムなら即時通知＋監視数も無制限です。</p>' +
    `<p style="margin:6px 0 0"><a href="${escapeHtml(pricingUrl)}" style="color:#3730a3;font-weight:bold">プランを比較する</a></p>` +
    '</div>';
  return { textLines: text, htmlBlock: html };
}

export function buildNotifyEmail(
  slots: NotifySlot[],
  options: BuildNotifyEmailOptions = {},
): NotifyEmailContent {
  if (slots.length === 0) {
    throw new Error('buildNotifyEmail requires at least one slot');
  }

  const tier: PlanTier = options.tier ?? 'premium';
  const groups = groupByTherapist(slots);
  const groupRanges = groups.map((g) => groupConsecutiveRanges(g.slots));
  const subject = buildSubject(slots, groups, groupRanges);
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, '');
  const watchesUrl = `${baseUrl}/watches`;
  const upsell = buildUpsell(tier, baseUrl);

  const textLines: string[] = [];
  textLines.push('監視中のセラピストに空きが出ました。');
  textLines.push('');
  groups.forEach((group, gi) => {
    const heading = group.salonName
      ? `▼ ${group.therapistName}（${group.salonName}）`
      : `▼ ${group.therapistName}`;
    textLines.push(heading);
    for (const range of groupRanges[gi]!) {
      const url = buildReservationUrl({
        site: group.site,
        shopId: group.shopId,
        therapistId: group.therapistId,
        date: range.date,
      });
      textLines.push(
        `  - ${formatDate(range.date)} ${formatRangeTime(range)}  ${url}`,
      );
    }
    textLines.push('');
  });
  if (upsell) {
    for (const line of upsell.textLines) textLines.push(line);
    textLines.push('');
  }
  textLines.push('──');
  textLines.push(`通知設定の変更: ${watchesUrl}`);
  const text = textLines.join('\n');

  const htmlParts: string[] = [];
  htmlParts.push('<p>監視中のセラピストに空きが出ました。</p>');
  groups.forEach((group, gi) => {
    const heading = group.salonName
      ? `${escapeHtml(group.therapistName)}<span style="color:#666">（${escapeHtml(
          group.salonName,
        )}）</span>`
      : escapeHtml(group.therapistName);
    htmlParts.push(`<h3 style="margin:16px 0 4px">${heading}</h3>`);
    htmlParts.push('<ul style="margin:0 0 12px 20px;padding:0">');
    for (const range of groupRanges[gi]!) {
      const url = buildReservationUrl({
        site: group.site,
        shopId: group.shopId,
        therapistId: group.therapistId,
        date: range.date,
      });
      htmlParts.push(
        `<li>${escapeHtml(formatDate(range.date))} ${escapeHtml(
          formatRangeTime(range),
        )} <a href="${escapeHtml(url)}">予約ページを開く</a></li>`,
      );
    }
    htmlParts.push('</ul>');
  });
  if (upsell) {
    htmlParts.push(upsell.htmlBlock);
  }
  htmlParts.push(
    `<hr style="margin:16px 0;border:none;border-top:1px solid #eee" /><p style="font-size:12px;color:#666">通知設定の変更: <a href="${escapeHtml(
      watchesUrl,
    )}">${escapeHtml(watchesUrl)}</a></p>`,
  );
  const html = htmlParts.join('');

  return { subject, text, html };
}
