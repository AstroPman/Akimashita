import { z } from "zod";

export const WaitlistSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("メールアドレスの形式が正しくありません"),
});

export type WaitlistInput = z.infer<typeof WaitlistSchema>;
