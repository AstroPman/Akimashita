import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import {
  markSubscriptionDeleted,
  syncSubscriptionFromStripe,
} from "@/lib/stripe/sync";

// Stripe SDK が node の crypto を使うため、必ず Node ランタイムで実行する。
export const runtime = "nodejs";
// raw body を確実に得るためにキャッシュさせない。
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe.webhook] STRIPE_WEBHOOK_SECRET 未設定");
    return new NextResponse("server misconfigured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("missing signature", { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.error("[stripe.webhook] 署名検証失敗", err);
    return new NextResponse("invalid signature", { status: 400 });
  }

  try {
    await handleEvent(event, stripe);
  } catch (err) {
    console.error("[stripe.webhook] 処理失敗", {
      type: event.type,
      id: event.id,
      err,
    });
    // 5xx を返すと Stripe が再送する。意図的にリトライさせたい場合のみ 5xx。
    return new NextResponse("handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscriptionFromStripe(subscription, {
          userIdHint:
            session.client_reference_id ??
            (session.metadata?.user_id as string | undefined),
        });
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.trial_will_end":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscriptionFromStripe(subscription);
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await markSubscriptionDeleted(subscription);
      return;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // SDK の型上 invoice.subscription は廃止 / parent.subscription_details に移ったが、
      // 互換のために両方を見る。
      const subscriptionId =
        (invoice as unknown as { subscription?: string }).subscription ??
        invoice.parent?.subscription_details?.subscription;
      if (typeof subscriptionId === "string") {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscriptionFromStripe(subscription);
      }
      return;
    }

    default:
      // 他のイベントは無視
      return;
  }
}
