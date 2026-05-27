import Image from "next/image";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const ICON_SIZE: Record<Size, string> = {
  sm: "size-7",
  md: "size-9",
  lg: "size-10",
};

const TEXT_SIZE: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base sm:text-lg",
  lg: "text-lg sm:text-xl",
};

type Props = {
  size?: Size;
  /** ロゴマークだけを表示する */
  iconOnly?: boolean;
  className?: string;
  /** ロゴをページ最初の重要画像として優先読み込みする */
  priority?: boolean;
};

export function BrandLogo({
  size = "md",
  iconOnly = false,
  className,
  priority = false,
}: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        iconOnly && "gap-0",
        className,
      )}
    >
      <Image
        src="/landing/logo-mark.webp"
        alt={iconOnly ? "アキマシタ" : ""}
        width={1536}
        height={1024}
        priority={priority}
        sizes="60px"
        className={cn(ICON_SIZE[size], "w-auto object-contain")}
      />
      {!iconOnly && (
        <span
          className={cn(
            TEXT_SIZE[size],
            "font-bold tracking-tight text-foreground",
          )}
        >
          アキマシタ
        </span>
      )}
    </span>
  );
}
