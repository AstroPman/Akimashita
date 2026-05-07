import { ChevronRightIcon } from "lucide-react";

const STEPS = [
  {
    n: 1,
    title: "アカウントを作成",
    body: "メールアドレスでアカウントを作成し、プランをお選びいただきます。",
  },
  {
    n: 2,
    title: "監視するセラピストを登録",
    body: "対応サロンの中からセラピストと、希望日・時間帯を登録します。",
  },
  {
    n: 3,
    title: "空きが出たら通知",
    body: "予約サイトを定期巡回し、空き枠を見つけたらメールでお知らせします。",
  },
  {
    n: 4,
    title: "公式サイトで予約",
    body: "通知に含まれるリンクから、各サロンの公式予約ページで予約してください。",
  },
];

export function HowItWorks() {
  return (
    <section
      id="flow"
      className="relative mx-auto w-full max-w-6xl overflow-hidden px-4 py-16 sm:py-24"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          ご利用の流れ
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          登録から通知まで、4 ステップで完結します。
        </p>
      </div>

      <ol className="mt-12 flex list-none flex-col gap-6 lg:flex-row lg:items-stretch">
        {STEPS.flatMap((s, i) => {
          const card = (
            <li
              key={s.n}
              className="relative flex flex-1 flex-col rounded-3xl border border-white/90 bg-white/95 p-6 shadow-lg shadow-violet-100/50 backdrop-blur-sm"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-base font-bold text-white shadow-md shadow-sky-400/40">
                {s.n}
              </div>
              <h3 className="mt-4 text-sm font-bold">{s.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </li>
          );
          const arrow =
            i < STEPS.length - 1 ? (
              <li
                key={`arrow-${s.n}`}
                className="hidden shrink-0 items-center justify-center px-1 lg:flex"
                aria-hidden
              >
                <ChevronRightIcon className="size-7 text-muted-foreground/45" />
              </li>
            ) : null;
          return arrow ? [card, arrow] : [card];
        })}
      </ol>
    </section>
  );
}
