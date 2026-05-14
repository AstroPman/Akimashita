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
        <p className="mt-1 break-all font-medium">
          <a
            href="mailto:akimashita.support@gmail.com"
            className="underline underline-offset-2 hover:text-foreground"
          >
            akimashita.support@gmail.com
          </a>
        </p>
      </div>
    </>
  );
}
