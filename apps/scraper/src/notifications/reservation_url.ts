import type { SiteName } from '@alimashita/shared';

export interface ReservationUrlInput {
  site: SiteName;
  shopId: string;
  therapistId: string;
  date: string; // YYYY-MM-DD
}

export function buildReservationUrl(input: ReservationUrlInput): string {
  const { site, shopId, therapistId, date } = input;
  switch (site) {
    case 'caskan':
      return `https://r.caskan.jp/${encodeURIComponent(shopId)}?cast_id=${encodeURIComponent(
        therapistId,
      )}&date=${encodeURIComponent(date)}`;
    case 'grow':
      // TODO: grow-appt.com の確定的な予約 URL（メニュー/日付ディープリンク）が
      // わかったら差し替える。現状はホストへのフォールバック。
      return 'https://grow-appt.com/';
    case 'edc':
      // EDC は Step 進行型のため特定セラピスト/日時に直接リンクできない。
      // 店舗の予約フォーム TOP にフォールバックする。
      return `https://reserve-${encodeURIComponent(shopId)}.esthe-datacenter.com/reserve/`;
  }
}
