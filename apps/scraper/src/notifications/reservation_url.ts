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
      // Grow の予約フォームは page=menu でメニュー選択に飛ぶ。
      // menu_no は API 経由でないと取れない（セラピスト/メニュー別）ため、
      // メニュー選択画面までの誘導に留める。date はメニュー選択後の画面で選ぶ。
      return `https://grow-appt.com/reserve/order?SID=${encodeURIComponent(
        shopId,
      )}&page=menu&staff_no=${encodeURIComponent(therapistId)}`;
    case 'edc':
      // EDC は Step 進行型のため特定セラピスト/日時に直接リンクできない。
      // 店舗の予約フォーム TOP にフォールバックする。
      return `https://reserve-${encodeURIComponent(shopId)}.esthe-datacenter.com/reserve/`;
    case 'estama':
      // estama は店舗の予約フォームに ?cast_id=&reserve_date= を載せれば
      // セラピスト/日付までは事前選択された状態で遷移できる (時刻はスコープ外)。
      return `https://estama.jp/shop/${encodeURIComponent(shopId)}/reserve/`;
    case 'eyoyaku':
      // e-yoyaku.jp はセラピスト個別ページに飛べば 7-8 日分のタイムテーブルが
      // SSR で並んでおり、ユーザは目的の 15 分枠を直接クリックして予約フォームに進める。
      // 日付タブは ?selectedDate=N アンカで切り替えるが、N は「先頭からの index」で
      // 当日からの相対値は使えないため URL では指定しない (画面で当日タブが選択済み)。
      return `https://e-yoyaku.jp/shop/${encodeURIComponent(shopId)}/girl/${encodeURIComponent(
        therapistId,
      )}/`;
  }
}
