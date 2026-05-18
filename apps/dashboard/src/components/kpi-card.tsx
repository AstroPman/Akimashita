import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}

const TONE_CLASS: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-300",
  destructive: "text-destructive",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("min-w-44", className)}>
      <CardHeader>
        <CardDescription className="text-xs uppercase tracking-wide">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CardTitle className={cn("text-3xl font-semibold tabular-nums", TONE_CLASS[tone])}>
          {value}
        </CardTitle>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
