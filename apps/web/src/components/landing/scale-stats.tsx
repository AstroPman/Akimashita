import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

interface ScaleStatsProps {
  salonCount: number;
  therapistCount: number;
}

/**
 * LP の Hero 直下に置く「対応規模」訴求セクション。
 *
 * 数字は実際の `get_public_salons()` 由来の値だが、桁を意識した丸め表示で
 * 「数千・数万のセラピストに対応している」スケール感を強調する。
 * フェッチに失敗してゼロ件のときはセクションごと非表示にして寂しさを避ける。
 */
export function ScaleStats({ salonCount, therapistCount }: ScaleStatsProps) {
  if (salonCount <= 0 && therapistCount <= 0) return null;

  return (
    <section
      aria-labelledby="landing-scale-heading"
      className="mx-auto w-full max-w-5xl px-4 pb-8 sm:pb-12"
    >
      <h2 id="landing-scale-heading" className="sr-only">
        対応規模
      </h2>
      <div className="rounded-2xl border bg-card/70 px-6 py-7 shadow-sm backdrop-blur sm:px-10 sm:py-8">
        <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          全国の主要メンズエステに対応
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:gap-8">
          <Stat label="対応サロン" value={compactNumber(salonCount)} suffix="店" />
          <Stat
            label="対応セラピスト"
            value={compactNumber(therapistCount)}
            suffix="名"
          />
        </div>
        <div className="mt-6 flex justify-center">
          <Link
            href="/salons"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            対応サロン・セラピストを探す
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
      <p className="mt-1 flex items-baseline justify-center gap-1">
        <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground sm:text-4xl">
          {value}
        </span>
        <span className="text-sm text-muted-foreground sm:text-base">
          {suffix}
        </span>
      </p>
    </div>
  );
}

/**
 * 「対応規模」セクション向けの丸め表示。
 *  - 10,000 以上は千の位で切り捨て + "+" (例: 37,021 -> "37,000+")
 *  - 100 以上は百の位で切り捨て + "+" (例: 712 -> "700+")
 *  - それ未満は実数
 * 過大表示を避けるため必ず切り捨てとする。
 */
function compactNumber(n: number): string {
  if (n <= 0) return "0";
  const fmt = (v: number) =>
    new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(v);
  if (n >= 10_000) return `${fmt(Math.floor(n / 1_000) * 1_000)}+`;
  if (n >= 100) return `${fmt(Math.floor(n / 100) * 100)}+`;
  return fmt(n);
}
