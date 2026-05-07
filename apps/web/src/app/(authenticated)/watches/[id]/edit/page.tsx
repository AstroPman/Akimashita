import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { WatchForm } from "../../_components/watch-form";
import type { WatchFormInput } from "@/lib/schema/watch";

export const metadata: Metadata = {
  title: "監視を編集",
};

export default async function EditWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const [{ data: watch }, { data: salons }] = await Promise.all([
    supabase
      .from("watch_settings")
      .select(
        `id, therapist_id, is_active, notify_line, notify_email,
         watch_schedules (id, target_date, time_from, time_to),
         therapists!inner (id, name, salon_id, salons!inner (id, name))`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("salons")
      .select("id, name, sites!inner (id)")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  if (!watch) {
    notFound();
  }

  const watchTyped = watch as unknown as {
    id: string;
    therapist_id: string;
    is_active: boolean;
    notify_line: boolean;
    notify_email: boolean;
    watch_schedules: Array<{
      id: string;
      target_date: string | null;
      time_from: string | null;
      time_to: string | null;
    }>;
    therapists: { id: string; name: string; salon_id: string; salons: { id: string; name: string } };
  };

  const defaultValues: WatchFormInput = {
    therapist_id: watchTyped.therapist_id,
    is_active: watchTyped.is_active,
    notify_line: watchTyped.notify_line,
    notify_email: watchTyped.notify_email,
    schedules: watchTyped.watch_schedules.map((s) => ({
      target_date: s.target_date ?? "",
      time_from: s.time_from ? s.time_from.slice(0, 5) : "",
      time_to: s.time_to ? s.time_to.slice(0, 5) : "",
    })),
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
        <Link href="/watches">
          <ChevronLeftIcon className="size-4" />
          一覧に戻る
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">監視を編集</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          通知チャネルや希望日時を変更できます。
        </p>
      </div>
      <WatchForm
        mode="edit"
        watchId={watchTyped.id}
        salons={(salons ?? []) as never}
        initialSalonId={watchTyped.therapists.salon_id}
        initialTherapist={{
          id: watchTyped.therapists.id,
          name: watchTyped.therapists.name,
        }}
        defaultValues={defaultValues}
      />
    </div>
  );
}
