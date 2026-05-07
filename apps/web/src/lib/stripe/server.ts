import "server-only";
import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY が設定されていません");
  }

  // apiVersion は SDK 同梱のデフォルトを使用する。
  // 明示固定したくなったら Stripe.LATEST_API_VERSION を参照する。
  cached = new Stripe(secret, {
    typescript: true,
    appInfo: {
      name: "akimashita",
    },
  });
  return cached;
}
