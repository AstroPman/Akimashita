import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const ACCENT_RING: Record<"pink" | "violet" | "sky", string> = {
  pink: "from-pink-400/90 to-rose-400/85 shadow-pink-400/35 text-white",
  violet: "from-violet-500/90 to-fuchsia-500/85 shadow-fuchsia-400/35 text-white",
  sky: "from-sky-400/95 to-cyan-400/85 shadow-sky-400/35 text-white",
};

export function FeatureCard({
  icon,
  title,
  body,
  accent = "pink",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  accent?: keyof typeof ACCENT_RING;
}) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/90 p-7 text-card-foreground shadow-xl shadow-pink-100/40 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-pink-200/30">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg [&_svg]:size-6",
          ACCENT_RING[accent],
        )}
      >
        {icon}
      </div>
      <h3 className="mt-5 text-base font-bold tracking-tight">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
