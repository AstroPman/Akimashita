import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lambda 実行時 (`AWS_LAMBDA_FUNCTION_NAME` が set される) は環境変数注入で完結するため、
// dotenv のロードはローカル開発時のみ行う。バンドル後の path 解決での無駄なエラーも避ける。
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  loadDotenv({ path: path.resolve(here, '../../.env') });
  loadDotenv();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  USER_AGENT: optional(
    'USER_AGENT',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ),
  MIN_DELAY_MS: optionalInt('MIN_DELAY_MS', 300),
  MAX_DELAY_MS: optionalInt('MAX_DELAY_MS', 800),
  HTTP_TIMEOUT_MS: optionalInt('HTTP_TIMEOUT_MS', 15_000),
  HTTP_MAX_RETRIES: optionalInt('HTTP_MAX_RETRIES', 3),
  // Stage 4: notify 用設定。RESEND_API_KEY / EMAIL_FROM は notify ステージ
  // 実行時のみ必須。ここでは optional として読み込み、利用側で検証する。
  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  EMAIL_FROM: optional('EMAIL_FROM', ''),
  NOTIFY_USERS_PER_RUN: optionalInt('NOTIFY_USERS_PER_RUN', 50),
  NOTIFY_USER_INTERVAL_MS: optionalInt('NOTIFY_USER_INTERVAL_MS', 200),
  APP_BASE_URL: optional('APP_BASE_URL', 'http://localhost:3000'),
} as const;
