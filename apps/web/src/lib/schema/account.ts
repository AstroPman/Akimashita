import { z } from "zod";

const emailField = z
  .string()
  .min(1, "メールアドレスを入力してください")
  .email("メールアドレスの形式が正しくありません");

const passwordField = z
  .string()
  .min(8, "パスワードは8文字以上で入力してください")
  .max(72, "パスワードは72文字以下で入力してください");

export const UpdateEmailSchema = z.object({
  email: emailField,
});

export type UpdateEmailInput = z.infer<typeof UpdateEmailSchema>;

export const ForgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, "確認用パスワードを入力してください"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// アカウント削除時に入力させる確認文言。
export const DELETE_ACCOUNT_CONFIRM_TEXT = "削除する";

export const DeleteAccountSchema = z.object({
  confirm: z.literal(DELETE_ACCOUNT_CONFIRM_TEXT, {
    message: `「${DELETE_ACCOUNT_CONFIRM_TEXT}」と入力してください`,
  }),
});

export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
