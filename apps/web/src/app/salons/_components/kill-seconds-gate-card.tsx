import Link from "next/link";
import { LockIcon, TimerIcon } from "lucide-react";

/**
 * 公開セラピスト詳細ページ用の「平均瞬殺時間」ぼかしカード。
 * `[TherapistStatsBlock](apps/web/src/app/(authenticated)/watches/_components/therapist-stats.tsx)`
 * の `killSecondsGate` prop に渡して使う。
 *
 * 無料 / 未ログインユーザに対して、瞬殺時間 (median_kill_seconds) を
 * 数値ではなくぼかし表示にし、アップグレード導線（または signup 導線）を出す。
 */
export function KillSecondsGateCard({
  ctaHref,
  ctaLabel,
  description,
}: {
  ctaHref: string;
  ctaLabel: string;
  description: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <TimerIcon className="size-4" aria-hidden />
        平均瞬殺時間
      </div>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums leading-none text-foreground/60 blur-sm select-none"
        aria-hidden
      >
        00m 00s
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
      <Link
        href={ctaHref}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <LockIcon className="size-3" aria-hidden />
        {ctaLabel}
      </Link>
    </div>
  );
}
