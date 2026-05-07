import { ShieldCheckIcon } from "lucide-react";
import { getMaxSeats } from "@/lib/stripe/config";

export function WhyLimited() {
  const max = getMaxSeats();
  return (
    <section className="relative overflow-hidden border-y border-sky-100/80 bg-gradient-to-br from-sky-50 via-white to-fuchsia-50/40 py-16 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(56,189,248,0.18),transparent)]"
      />
      <div className="relative mx-auto w-full max-w-3xl px-4">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/90 px-4 py-1.5 text-xs font-semibold text-sky-800 shadow-sm shadow-sky-200/40 backdrop-blur-sm">
            <ShieldCheckIcon className="size-4 text-sky-600" />
            限定 {max} 名のサービスです
          </span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
            通知の価値を守るため、登録を絞っています
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            同じ枠を狙う人が増えるほど、通知が届いた時にはすでに予約が埋まっている、ということが起きやすくなります。
            アキマシタは「通知を受けた人が高い確率で予約できる」ことを大切にしているため、
            登録できる人数を {max} 名に限定しています。満員時はウェイトリスト形式でお待ちいただきます。
          </p>
        </div>
      </div>
    </section>
  );
}
