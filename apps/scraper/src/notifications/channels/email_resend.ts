import { Resend } from 'resend';
import { env } from '../../lib/env.js';
import type { EmailMessage, EmailSender } from './types.js';

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
