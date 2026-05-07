import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { WatchForm } from "../_components/watch-form";
import { defaultWatchFormValues } from "@/lib/schema/watch";

export const metadata: Metadata = {
  title: "新しく登録",
};

export default async function NewWatchPage() {
  const supabase = await createClient();
  const { data: salons } = await supabase
    .from("salons")
    .select("id, name, sites!inner (id)")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
        <Link href="/watches">
          <ChevronLeftIcon className="size-4" />
          一覧に戻る
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">新しく登録</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          サロン・セラピストを選び、通知チャネルと希望日時を設定してください。
        </p>
      </div>
      <WatchForm
        mode="create"
        salons={(salons ?? []) as never}
        defaultValues={defaultWatchFormValues}
      />
    </div>
  );
}
