/**
 * CloudWatch EMF (Embedded Metric Format) emitter。
 *
 * Lambda の stdout に EMF JSON を 1 行 `console.log` するだけで、Lambda の Log
 * Group がそれを解釈して CloudWatch メトリクスに自動変換してくれる。SDK 追加や
 * PutMetricData 呼び出しは不要、追加課金もなし。
 *
 * 無料枠（カスタムメトリクス 10 個/月）に収めるため、メトリクス名は意図的に
 * `JobDurationMs` / `RecordsProcessed` の 2 種類のみに絞っている。Stage を
 * dimension に持たせるので合計 2 × 4 stages = 8 metrics で 10 個以内に収まる。
 *
 * 成功 / 失敗の頻度は標準の `AWS/Lambda.Errors` / `Invocations` で十分把握できる
 * ため、ここでは emit しない。意味的な「処理した件数」と「所要時間」だけを薄く
 * 載せて、ダッシュボードの Row 4 に表示する用途。
 */

const NAMESPACE = 'Akimashita/Scraper';

// Lambda 側では Terraform が var.environment を環境変数として注入する。
// ローカル CLI 実行では未設定なので 'local' にフォールバックし、誤って本番系列に
// 混入させないようにする。
const ENVIRONMENT = process.env.SCRAPER_ENVIRONMENT ?? 'local';

export type StageName =
  | 'salons'
  | 'therapists'
  | 'availability'
  | 'availability_research'
  | 'official_shifts'
  | 'notify';

export interface JobMetrics {
  /** ジョブ全体の所要時間 (ms)。呼び出し側で `Date.now()` の差分を計測する。 */
  durationMs: number;
  /**
   * 処理した件数。Stage 毎に意味づけが変わる。
   *  - salons:                phase ごとの成果件数（discover=新規/更新, details=success, bookings=success, therapists=upserted, link=salons+therapists）
   *  - therapists:            同期できたサロン数
   *  - availability:          通知エンキュー件数（notification_logs に積まれた行数）
   *  - availability_research: research_enabled サロン配下で同期した枠の総数
   *  - official_shifts:       shift_announced 通知エンキュー件数
   *  - notify:                実際に送信できた notification_logs 行数
   */
  recordsProcessed: number;
}

export function emitJobMetrics(stage: StageName, m: JobMetrics): void {
  // 1 行 JSON で吐かないと EMF parser が認識しないので JSON.stringify を素直に使う。
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: NAMESPACE,
            Dimensions: [['Environment', 'Stage']],
            Metrics: [
              { Name: 'JobDurationMs', Unit: 'Milliseconds' },
              { Name: 'RecordsProcessed', Unit: 'Count' },
            ],
          },
        ],
      },
      Environment: ENVIRONMENT,
      Stage: stage,
      JobDurationMs: m.durationMs,
      RecordsProcessed: m.recordsProcessed,
    }),
  );
}
