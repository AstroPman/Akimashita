"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { WatchFormSchema, type WatchFormInput } from "@/lib/schema/watch";
import { createWatch, updateWatch } from "../actions";

type SalonOption = {
  id: string;
  name: string;
};

type TherapistOption = { id: string; name: string };

type WatchFormProps = {
  mode: "create" | "edit";
  watchId?: string;
  salons: SalonOption[];
  initialSalonId?: string;
  initialTherapist?: TherapistOption;
  defaultValues: WatchFormInput;
};

export function WatchForm({
  mode,
  watchId,
  salons,
  initialSalonId,
  initialTherapist,
  defaultValues,
}: WatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [salonId, setSalonId] = useState<string | undefined>(initialSalonId);
  const [therapists, setTherapists] = useState<TherapistOption[]>(
    initialTherapist ? [initialTherapist] : [],
  );
  const [therapistsLoading, setTherapistsLoading] = useState(false);
  const [therapistId, setTherapistId] = useState<string>(
    defaultValues.therapist_id,
  );
  const [therapistOpen, setTherapistOpen] = useState(false);
  const [salonOpen, setSalonOpen] = useState(false);

  const [isActive, setIsActive] = useState(defaultValues.is_active);
  const [notifyEmail, setNotifyEmail] = useState(defaultValues.notify_email);
  const [notifyLine, setNotifyLine] = useState(defaultValues.notify_line);
  const [schedules, setSchedules] = useState<WatchFormInput["schedules"]>(
    defaultValues.schedules,
  );
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!salonId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("therapists")
      .select("id, name")
      .eq("salon_id", salonId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("セラピスト一覧の取得に失敗しました");
          setTherapists([]);
        } else {
          setTherapists((data ?? []) as TherapistOption[]);
        }
        setTherapistsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salonId]);

  const selectedTherapist = therapists.find((t) => t.id === therapistId);
  const selectedSalon = salons.find((s) => s.id === salonId);

  const handleSalonChange = (next: string) => {
    if (next === salonId) return;
    setSalonId(next);
    setTherapistId("");
    setTherapists([]);
    setTherapistsLoading(Boolean(next));
  };

  const updateSchedule = (
    index: number,
    patch: Partial<WatchFormInput["schedules"][number]>,
  ) => {
    setSchedules((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  };

  const addSchedule = () => {
    setSchedules((prev) => [
      ...prev,
      { target_date: "", time_from: "", time_to: "" },
    ]);
  };

  const removeSchedule = (index: number) => {
    setSchedules((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const input: WatchFormInput = {
      therapist_id: therapistId,
      is_active: isActive,
      notify_email: notifyEmail,
      notify_line: notifyLine,
      schedules,
    };

    const parsed = WatchFormSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      setErrors(fieldErrors);
      toast.error("入力内容を確認してください");
      return;
    }

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createWatch(parsed.data)
          : await updateWatch(watchId!, parsed.data);

      if (res && !res.ok) {
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
        }
        if (res.code === "duplicate" || res.code === "limit_reached") {
          toast.warning(res.message);
        } else {
          toast.error(res.message);
        }
        return;
      }
      toast.success(mode === "create" ? "監視を作成しました" : "監視を更新しました");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">セラピスト</h2>
          <p className="text-xs text-muted-foreground">
            サロンを選んでからセラピストを指定します。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="salon">サロン</Label>
            <Popover open={salonOpen} onOpenChange={setSalonOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="salon"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={salonOpen}
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedSalon && "text-muted-foreground",
                  )}
                >
                  {selectedSalon ? selectedSalon.name : "サロンを選択"}
                  <ChevronsUpDownIcon className="size-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="名前で検索..." />
                  <CommandList>
                    <CommandEmpty>該当するサロンがありません</CommandEmpty>
                    <CommandGroup>
                      {salons.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={s.name}
                          onSelect={() => {
                            handleSalonChange(s.id);
                            setSalonOpen(false);
                          }}
                        >
                          <CheckIcon
                            className={cn(
                              "mr-2 size-4",
                              salonId === s.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {s.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>セラピスト</Label>
            <Popover
              open={therapistOpen}
              onOpenChange={(open) => {
                if (!salonId) return;
                setTherapistOpen(open);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={therapistOpen}
                  disabled={!salonId}
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedTherapist && "text-muted-foreground",
                  )}
                >
                  {selectedTherapist
                    ? selectedTherapist.name
                    : salonId
                      ? "セラピストを選択"
                      : "先にサロンを選択"}
                  <ChevronsUpDownIcon className="size-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder="名前で検索..." />
                  <CommandList>
                    {therapistsLoading ? (
                      <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                        <Loader2Icon className="mr-2 size-3 animate-spin" />
                        読み込み中
                      </div>
                    ) : (
                      <>
                        <CommandEmpty>該当するセラピストがいません</CommandEmpty>
                        <CommandGroup>
                          {therapists.map((t) => (
                            <CommandItem
                              key={t.id}
                              value={t.name}
                              onSelect={() => {
                                setTherapistId(t.id);
                                setTherapistOpen(false);
                              }}
                            >
                              <CheckIcon
                                className={cn(
                                  "mr-2 size-4",
                                  therapistId === t.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {t.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.therapist_id?.[0] ? (
              <p className="text-xs text-destructive">{errors.therapist_id[0]}</p>
            ) : null}
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">通知設定</h2>
          <p className="text-xs text-muted-foreground">
            空き枠が出たときに送る通知方法を選択します。
          </p>
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <ToggleRow
            label="監視を有効にする"
            description="無効にすると一覧から空き枠の通知が止まります。"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Separator />
          <ToggleRow
            label="メール通知"
            description="登録メールアドレス宛に通知します。"
            checked={notifyEmail}
            onCheckedChange={setNotifyEmail}
          />
          <Separator />
          <ToggleRow
            label="LINE 通知"
            description="LINE 連携時に通知します。"
            checked={notifyLine}
            onCheckedChange={setNotifyLine}
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">希望日時</h2>
            <p className="text-xs text-muted-foreground">
              指定なしの場合は日時問わず通知。日付＋時間帯で絞り込みも可能です（時刻は JST）。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSchedule}
            className="gap-1"
          >
            <PlusIcon className="size-4" />
            追加
          </Button>
        </div>

        {schedules.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            希望日時の指定はありません（すべての空き枠が通知対象）。
          </p>
        ) : (
          <ul className="space-y-3">
            {schedules.map((s, idx) => (
              <li
                key={idx}
                className="rounded-lg border p-4"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label htmlFor={`date-${idx}`} className="text-xs">
                      日付
                    </Label>
                    <Input
                      id={`date-${idx}`}
                      type="date"
                      value={s.target_date ?? ""}
                      onChange={(e) =>
                        updateSchedule(idx, { target_date: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`from-${idx}`} className="text-xs">
                      開始
                    </Label>
                    <Input
                      id={`from-${idx}`}
                      type="time"
                      value={s.time_from ?? ""}
                      onChange={(e) =>
                        updateSchedule(idx, { time_from: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`to-${idx}`} className="text-xs">
                      終了
                    </Label>
                    <Input
                      id={`to-${idx}`}
                      type="time"
                      value={s.time_to ?? ""}
                      onChange={(e) =>
                        updateSchedule(idx, { time_to: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSchedule(idx)}
                      aria-label="この行を削除"
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                </div>
                {errors[`schedules.${idx}.target_date`]?.[0] ? (
                  <p className="mt-2 text-xs text-destructive">
                    {errors[`schedules.${idx}.target_date`][0]}
                  </p>
                ) : null}
                {errors[`schedules.${idx}.time_to`]?.[0] ? (
                  <p className="mt-2 text-xs text-destructive">
                    {errors[`schedules.${idx}.time_to`][0]}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {errors.schedules?.[0] ? (
          <p className="text-xs text-destructive">{errors.schedules[0]}</p>
        ) : null}
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/watches")}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : null}
          {mode === "create" ? "作成する" : "更新する"}
        </Button>
      </div>
    </form>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
