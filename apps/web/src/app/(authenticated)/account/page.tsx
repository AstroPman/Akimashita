import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatJstDateTime } from "@/lib/date";
import { isPlan } from "@/lib/stripe/config";
import { UpdateEmailForm } from "./_components/update-email-form";
import { ResetPasswordButton } from "./_components/reset-password-button";
import { DeleteAccountDialog } from "./_components/delete-account-dialog";
import { BillingCard } from "./_components/billing-card";

export const metadata: Metadata = {
  title: "アカウント設定",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // (authenticated) layout でガード済みだが型を絞る。
  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("email, line_user_id, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? "";
  const lineUserId = profile?.line_user_id ?? null;
  const createdAt = profile?.created_at ?? user.created_at ?? null;

  // subscriptions は service role でしか書けないが、本人の行は RLS で読める。
  // service role 経由で取得することで、RLS が将来厳しくなっても影響を受けない。
  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select(
      "status, plan, current_period_end, trial_end, cancel_at_period_end, stripe_customer_id",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">アカウント設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          メールアドレス・パスワード・アカウントの管理ができます。
        </p>
      </div>

      <BillingCard
        status={subscription?.status ?? null}
        plan={isPlan(subscription?.plan) ? subscription.plan : null}
        currentPeriodEnd={subscription?.current_period_end ?? null}
        trialEnd={subscription?.trial_end ?? null}
        cancelAtPeriodEnd={subscription?.cancel_at_period_end ?? false}
        hasStripeCustomer={Boolean(subscription?.stripe_customer_id)}
      />

      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
          <CardDescription>アカウントの登録情報です。</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-6">
            <dt className="text-muted-foreground">メールアドレス</dt>
            <dd className="break-all">{email || "未設定"}</dd>

            <dt className="text-muted-foreground">LINE 連携</dt>
            <dd>{lineUserId ? lineUserId : "未連携"}</dd>

            <dt className="text-muted-foreground">登録日</dt>
            <dd>{createdAt ? formatJstDateTime(createdAt) : "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>メールアドレスの変更</CardTitle>
          <CardDescription>
            新しいメールアドレスに送信される確認メールのリンクをクリックすると変更が反映されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateEmailForm currentEmail={email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>パスワードの変更</CardTitle>
          <CardDescription>
            登録メールアドレス宛にパスワード再設定のリンクを送信します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordButton />
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">アカウントの削除</CardTitle>
          <CardDescription>
            アカウントを削除すると、登録されている監視設定や通知履歴を含めすべて削除されます。
            この操作は取り消せません。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog />
        </CardContent>
      </Card>
    </div>
  );
}
