import type { ReactNode } from "react";

export function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-20 w-20 items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_svg]:size-12">
        {icon}
      </div>
      <h3 className="mt-3 text-base font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-[16rem] text-xs leading-relaxed text-muted-foreground sm:text-sm">
        {body}
      </p>
    </div>
  );
}
