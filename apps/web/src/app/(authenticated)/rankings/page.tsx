import type { Metadata } from "next";
import { TimerIcon, UsersIcon } from "lucide-react";
import { formatKillSeconds } from "@/lib/format";
import {
  getKillTimeRanking,
  getWatcherCountRanking,
  RANKING_DEFAULTS,
} from "@/lib/rankings";
import { RankingList, type RankingListItem } from "./_components/ranking-list";

export const metadata: Metadata = {
  title: "セラピストランキング",
};

export default async function RankingsPage() {
  const [killRows, watcherRows] = await Promise.all([
    getKillTimeRanking(),
    getWatcherCountRanking(),
  ]);

  const killItems: RankingListItem[] = killRows.map((row) => ({
    therapistId: row.therapistId,
    name: row.name,
    imageUrl: row.imageUrl,
    profileUrl: row.profileUrl,
    salonName: row.salonName,
    metricLabel: formatKillSeconds(row.medianKillSeconds),
    metricSublabel: `${row.sampleCount}件のサンプル`,
  }));

  const watcherItems: RankingListItem[] = watcherRows.map((row) => ({
    therapistId: row.therapistId,
    name: row.name,
    imageUrl: row.imageUrl,
    profileUrl: row.profileUrl,
    salonName: row.salonName,
    metricLabel: `${row.watcherCount.toLocaleString("ja-JP")}人`,
    metricSublabel: "監視中ユーザ数",
  }));

  return (
    <div className="space-y-8 pb-24 sm:pb-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          セラピストランキング
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          アキマシタが観測しているデータから、競争率の高いセラピストを 2 つの軸で集計しています。
        </p>
      </header>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <TimerIcon
              className="size-4 text-muted-foreground"
              aria-hidden
            />
            瞬殺時間が短いセラピスト
          </h2>
          <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
            直近{RANKING_DEFAULTS.windowDays}日に「空きが観測されてから埋まるまで」の中央値が短い順 / 上位
            {RANKING_DEFAULTS.limit}名（サンプル
            {RANKING_DEFAULTS.minSamples}件以上）。
          </p>
        </div>
        <RankingList
          items={killItems}
          emptyText="まだ集計に十分なデータがありません。状態変化の蓄積をお待ちください。"
        />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <UsersIcon
              className="size-4 text-muted-foreground"
              aria-hidden
            />
            監視登録が多いセラピスト
          </h2>
          <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
            現時点でアクティブな監視設定の人数が多い順 / 上位
            {RANKING_DEFAULTS.limit}名。
          </p>
        </div>
        <RankingList
          items={watcherItems}
          emptyText="まだ監視設定が登録されていません。"
        />
      </section>
    </div>
  );
}
