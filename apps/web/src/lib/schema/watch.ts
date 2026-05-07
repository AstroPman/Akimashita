import { z } from "zod";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません");

const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "時刻の形式が正しくありません");

export const ScheduleSchema = z
  .object({
    target_date: z.union([dateString, z.literal("")]).optional(),
    time_from: z.union([timeString, z.literal("")]).optional(),
    time_to: z.union([timeString, z.literal("")]).optional(),
  })
  .refine(
    (v) => {
      if (!v.time_from && !v.time_to) return true;
      return Boolean(v.time_from) && Boolean(v.time_to);
    },
    {
      message: "開始時間と終了時間は両方指定してください",
      path: ["time_to"],
    },
  )
  .refine(
    (v) => {
      if (!v.time_from || !v.time_to) return true;
      return v.time_from < v.time_to;
    },
    {
      message: "終了時間は開始時間より後を指定してください",
      path: ["time_to"],
    },
  )
  .refine(
    (v) => {
      if ((v.time_from || v.time_to) && !v.target_date) return false;
      return true;
    },
    {
      message: "時間帯を指定する場合は日付も指定してください",
      path: ["target_date"],
    },
  );

export type ScheduleInput = z.infer<typeof ScheduleSchema>;

export const WatchFormSchema = z.object({
  therapist_id: z.string().uuid("セラピストを選択してください"),
  is_active: z.boolean(),
  notify_line: z.boolean(),
  notify_email: z.boolean(),
  schedules: z.array(ScheduleSchema).max(20, "希望日時は20件まで登録できます"),
});

export type WatchFormInput = z.infer<typeof WatchFormSchema>;

export const defaultWatchFormValues: WatchFormInput = {
  therapist_id: "",
  is_active: true,
  notify_line: false,
  notify_email: true,
  schedules: [],
};
