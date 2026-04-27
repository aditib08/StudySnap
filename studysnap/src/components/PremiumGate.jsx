import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { app, auth, db } from "../firebase.js";

const STRIPE_PUBLISHABLE_KEY =
  "pk_test_51TQevBEGomazt6G3n6YPWdqGllDVciffiJ43j3dPvHEubrQ1HOPXJhYw4DzbJKiTubgOiJnAQCoWEKi9MHHk3MsK00E3zPpQ5a";

function readableCheckoutError(err) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").trim();
  if (code.includes("unauthenticated")) return "Please sign in, then try upgrading.";
  if (code.includes("failed-precondition")) return msg || "Premium pricing is not configured on the server yet.";
  if (code.includes("invalid-argument")) return msg || "Checkout request was invalid.";
  if (code.includes("internal")) {
    return "Payment setup is incomplete right now. Ask admin to deploy functions and set Stripe secrets/price.";
  }
  return msg || "Could not start checkout.";
}

export default function PremiumGate({ isOpen, onClose }) {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [plan, setPlan] = useState("free");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setPlan("free");
      setLoadingPlan(false);
      return;
    }
    setLoadingPlan(true);
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const raw = String(snap.data()?.plan ?? "free").toLowerCase();
        setPlan(raw === "premium" ? "premium" : "free");
        setLoadingPlan(false);
      },
      () => {
        setPlan("free");
        setLoadingPlan(false);
      }
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (plan === "premium" && isOpen) {
      onClose?.();
    }
  }, [isOpen, onClose, plan]);

  const checkoutPayload = useMemo(() => {
    const origin = window.location.origin;
    const profileUrl = `${origin}/profile`;
    return {
      uid,
      successUrl: `${profileUrl}?premium=success`,
      cancelUrl: `${profileUrl}?premium=cancelled`,
    };
  }, [uid]);

  async function startCheckout() {
    setError("");
    if (!uid) {
      setError("Sign in first to upgrade.");
      return;
    }
    setCheckoutBusy(true);
    try {
      const projectId =
        import.meta.env.VITE_FIREBASE_PROJECT_ID || app.options.projectId;
      if (!projectId) {
        throw new Error(
          "Missing Firebase project id. Set VITE_FIREBASE_PROJECT_ID."
        );
      }
      const endpoint = `https://us-central1-${projectId}.cloudfunctions.net/createCheckoutSession`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-stripe-publishable-key": STRIPE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(checkoutPayload),
      });
      const data = await response.json();
      const url = data?.url;
      if (!response.ok) {
        throw new Error(data?.error || "Checkout request failed.");
      }
      if (!url) {
        throw new Error("Checkout URL was not returned.");
      }
      window.location.assign(url);
    } catch (err) {
      const raw = String(err?.message ?? "");
      if (raw.toLowerCase().includes("failed to fetch")) {
        setError(
          "Cannot reach checkout service yet. Deploy functions and verify CORS is enabled."
        );
      } else {
        setError(readableCheckoutError(err));
      }
      setCheckoutBusy(false);
    }
  }

  if (!isOpen || loadingPlan || plan === "premium") return null;

  return (
    <div className="paywall-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-premium-heading">
      <section className="paywall-modal card">
        <h2 id="profile-premium-heading" className="profile-section-title">
          Premium Required
        </h2>
        <p className="page-lead">
          Upgrade to premium to continue.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onClose}
          disabled={checkoutBusy}
        >
          Not now
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={startCheckout}
          disabled={checkoutBusy}
        >
          {checkoutBusy ? "Redirecting to Stripe…" : "Upgrade ($1.99)"}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
