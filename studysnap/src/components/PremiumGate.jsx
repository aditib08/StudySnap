import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase.js";

const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_6oU3cv4zsabLeoodgKdMI00";

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

  async function startCheckout() {
    setError("");
    if (!uid) {
      setError("Sign in first to upgrade.");
      return;
    }
    setCheckoutBusy(true);
    try {
      if (
        !STRIPE_PAYMENT_LINK ||
        STRIPE_PAYMENT_LINK.includes("YOUR_LINK_HERE")
      ) {
        throw new Error("Set STRIPE_PAYMENT_LINK in PremiumGate.");
      }
      window.location.href = STRIPE_PAYMENT_LINK;
    } catch (err) {
      setError(readableCheckoutError(err));
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
