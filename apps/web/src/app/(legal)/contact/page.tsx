import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お問い合わせ",
};

export default function ContactPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">お問い合わせ</h1>
      <p className="mt-6 text-sm leading-7">
        本サービスに関するお問い合わせは、下記メールアドレスまでお願いいたします。
      </p>

      <div className="mt-6 rounded-xl border bg-card p-6 text-sm">
        <p className="text-muted-foreground">メールアドレス</p>
        <p className="mt-1 break-all font-medium">support@example.com</p>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        ※ 公開前に問い合わせ先のメールアドレス・問い合わせフォーム等を整備してください。
      </p>
    </>
  );
}
