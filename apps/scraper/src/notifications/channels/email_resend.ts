import { Resend } from 'resend';
import { env } from '../../lib/env.js';
import type {
  BatchSendResultItem,
  EmailMessage,
  EmailSender,
} from './types.js';

class ResendEmailSender implements EmailSender {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.error) {
      throw new Error(
        `Resend send failed: ${result.error.name ?? 'Error'}: ${result.error.message}`,
      );
    }
  }

  /**
   * Resend Batch API でまとめて送信する。
   *   - 1 リクエストあたり最大 100 通（呼び出し側でチャンク分割する想定）。
   *   - strict モード（既定）を使用。1 通でも validation エラーがあれば
   *     リクエスト全体が失敗する。本サービスでは事前に email != null
   *     を保証しているため実害は小さい。
   *   - レスポンスの `data` は入力配列とインデックスが一致する仕様。
   *     念のため長さが異なる場合はベストエフォートでマッピングする。
   *
   * @see https://resend.com/docs/api-reference/emails/send-batch-emails
   */
  async sendBatch(messages: EmailMessage[]): Promise<BatchSendResultItem[]> {
    if (messages.length === 0) return [];

    const payload = messages.map((m) => ({
      from: this.from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
    }));

    const result = await this.client.batch.send(payload);

    if (result.error) {
      const errorMessage = `Resend batch send failed: ${result.error.name ?? 'Error'}: ${result.error.message}`;
      return messages.map(() => ({ ok: false, error: errorMessage }));
    }

    const data = result.data?.data ?? [];
    return messages.map((_, i) => {
      const id = data[i]?.id;
      if (!id) {
        return {
          ok: false,
          error: 'Resend batch returned no id for this entry',
        };
      }
      return { ok: true, providerMessageId: id };
    });
  }
}

export function createResendEmailSender(): EmailSender {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required for notify stage');
  }
  if (!env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is required for notify stage');
  }
  return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
}
