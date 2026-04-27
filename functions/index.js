import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import Stripe from "stripe";

initializeApp();

const db = getFirestore();
const stripeSecretKey = defineString("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineString("STRIPE_WEBHOOK_SECRET");
const stripePremiumPriceId = defineString("STRIPE_PREMIUM_PRICE_ID");

function getStripe(secret) {
  return new Stripe(secret, {
    apiVersion: "2025-03-31.basil",
  });
}

export const createStripeCheckoutSession = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "You must be signed in.");
      }

      const { successUrl, cancelUrl } = request.data ?? {};
      if (!successUrl || !cancelUrl) {
        throw new HttpsError(
          "invalid-argument",
          "successUrl and cancelUrl are required."
        );
      }
      const fixedPriceId = String(stripePremiumPriceId.value() ?? "").trim();
      if (!fixedPriceId) {
        throw new HttpsError(
          "failed-precondition",
          "Server price is not configured (STRIPE_PREMIUM_PRICE_ID)."
        );
      }

      const stripe = getStripe(stripeSecretKey.value());
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: fixedPriceId, quantity: 1 }],
        success_url: String(successUrl),
        cancel_url: String(cancelUrl),
        client_reference_id: request.auth.uid,
        customer_email: request.auth.token.email ?? undefined,
        metadata: {
          uid: request.auth.uid,
        },
        allow_promotion_codes: true,
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError(
        "internal",
        `Checkout creation failed: ${err?.message ?? "unknown error"}`
      );
    }
  }
);

/**
 * HTTPS endpoint variant:
 * POST body: { uid: string, successUrl?: string, cancelUrl?: string }
 * Response: { url: string, sessionId: string }
 */
export const createCheckoutSession = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    try {
      const uid = String(req.body?.uid ?? "").trim();
      if (!uid) {
        res.status(400).json({ error: "uid is required" });
        return;
      }

      const fixedPriceId = String(
        stripePremiumPriceId.value() || "price_1TQfLfEGomazt6G3uwXv1PWp"
      ).trim();
      const origin = req.headers.origin || "http://localhost:5173";
      const successUrl = String(req.body?.successUrl ?? `${origin}/profile?premium=success`);
      const cancelUrl = String(req.body?.cancelUrl ?? `${origin}/profile?premium=cancelled`);

      const stripe = getStripe(stripeSecretKey.value());
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: fixedPriceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: uid,
        metadata: { uid },
        allow_promotion_codes: true,
      });

      res.status(200).json({
        url: session.url,
        sessionId: session.id,
      });
    } catch (err) {
      res.status(500).json({
        error: `Checkout creation failed: ${err?.message ?? "unknown error"}`,
      });
    }
  }
);

export const stripeWebhook = onRequest(
  {
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).send("Missing stripe-signature header.");
      return;
    }

    const stripe = getStripe(stripeSecretKey.value());
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        stripeWebhookSecret.value()
      );
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      const uid = session?.metadata?.uid || session?.client_reference_id;

      if (uid) {
        await db.doc(`users/${uid}`).set(
          {
            plan: "premium",
            premiumUpdatedAt: FieldValue.serverTimestamp(),
            stripeCustomerId: session.customer ?? null,
            stripeSubscriptionId: session.subscription ?? null,
          },
          { merge: true }
        );
      }
    }

    res.status(200).json({ received: true });
  }
);
