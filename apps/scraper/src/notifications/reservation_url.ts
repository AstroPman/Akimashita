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
    case 'estama':
      // estama は店舗の予約フォームに ?cast_id=&reserve_date= を載せれば
      // セラピスト/日付までは事前選択された状態で遷移できる (時刻はスコープ外)。
      return `https://estama.jp/shop/${encodeURIComponent(shopId)}/reserve/`;
  }
}
