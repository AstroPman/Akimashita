import Link from "next/link";
import { Button } from "@/components/ui/button";

export { SupportedSalonsList } from "./supported-salons-searchable-list";

export function SupportedSalonsTeaser({ count }: { count: number }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-6">
      <h2 className="text-lg font-semibold tracking-tight">対応サロン</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        お申し込み前に、ご利用のサロンが対象かご確認ください。
      </p>
      <p className="mt-3 text-sm text-foreground">
        現在{" "}
        <span className="font-semibold tabular-nums">{count}</span>{" "}
        件のサロンに対応しています。
      </p>
      <Button asChild variant="outline" className="mt-4" size="sm">
        <Link href="/salons">対応サロン一覧を見る</Link>
      </Button>
    </div>
  );
}
