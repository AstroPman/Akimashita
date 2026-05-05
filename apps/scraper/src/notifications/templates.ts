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

function buildSubject(slots: NotifySlot[], groups: SlotsByTherapist[]): string {
  if (slots.length === 1) {
    const only = slots[0]!;
    return `[akimashita] ${only.therapistName} の空きが出ました（${formatDate(
      only.date,
    )} ${formatTime(only.startTime)}）`;
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

export function buildNotifyEmail(slots: NotifySlot[]): NotifyEmailContent {
  if (slots.length === 0) {
    throw new Error('buildNotifyEmail requires at least one slot');
  }

  const groups = groupByTherapist(slots);
  const subject = buildSubject(slots, groups);
  const watchesUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/watches`;

  const textLines: string[] = [];
  textLines.push('監視中のセラピストに空きが出ました。');
  textLines.push('');
  for (const group of groups) {
    const heading = group.salonName
      ? `▼ ${group.therapistName}（${group.salonName}）`
      : `▼ ${group.therapistName}`;
    textLines.push(heading);
    for (const slot of group.slots) {
      const url = buildReservationUrl({
        site: group.site,
        shopId: group.shopId,
        therapistId: group.therapistId,
        date: slot.date,
      });
      textLines.push(
        `  - ${formatDate(slot.date)} ${formatTime(slot.startTime)}  ${url}`,
      );
    }
    textLines.push('');
  }
  textLines.push('──');
  textLines.push(`通知設定の変更: ${watchesUrl}`);
  const text = textLines.join('\n');

  const htmlParts: string[] = [];
  htmlParts.push('<p>監視中のセラピストに空きが出ました。</p>');
  for (const group of groups) {
    const heading = group.salonName
      ? `${escapeHtml(group.therapistName)}<span style="color:#666">（${escapeHtml(
          group.salonName,
        )}）</span>`
      : escapeHtml(group.therapistName);
    htmlParts.push(`<h3 style="margin:16px 0 4px">${heading}</h3>`);
    htmlParts.push('<ul style="margin:0 0 12px 20px;padding:0">');
    for (const slot of group.slots) {
      const url = buildReservationUrl({
        site: group.site,
        shopId: group.shopId,
        therapistId: group.therapistId,
        date: slot.date,
      });
      htmlParts.push(
        `<li>${escapeHtml(formatDate(slot.date))} ${escapeHtml(
          formatTime(slot.startTime),
        )} <a href="${escapeHtml(url)}">予約ページを開く</a></li>`,
      );
    }
    htmlParts.push('</ul>');
  }
  htmlParts.push(
    `<hr style="margin:16px 0;border:none;border-top:1px solid #eee" /><p style="font-size:12px;color:#666">通知設定の変更: <a href="${escapeHtml(
      watchesUrl,
    )}">${escapeHtml(watchesUrl)}</a></p>`,
  );
  const html = htmlParts.join('');

  return { subject, text, html };
}
