export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * バッチ送信時の 1 通分の結果。送信プロバイダ側の per-email エラー
 * （配送拒否やバリデーション失敗）を呼び出し側で個別ハンドリングできるように、
 * 入力配列とインデックスが揃った形で返す契約にしている。
 */
export interface BatchSendResultItem {
  ok: boolean;
  /** Resend など外部プロバイダの message id（取得できる場合のみ） */
  providerMessageId?: string;
  /** 失敗時のエラー文言（成功時は undefined） */
  error?: string;
}

export interface EmailSender {
  /** 単発送信。dry-run / フォールバック用。 */
  send(message: EmailMessage): Promise<void>;

  /**
   * バッチ送信。プロバイダのバッチエンドポイントを使い、HTTP 1 リクエストで
   * 複数通を投げる。返り値は入力 `messages` と同じ長さ・同じ順序の配列。
   * バッチ全体が失敗した場合は全要素 ok=false で同じ error を入れて返す。
   */
  sendBatch(messages: EmailMessage[]): Promise<BatchSendResultItem[]>;
}
