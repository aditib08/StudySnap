import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase.js";

export default function PremiumRoute({ children }) {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [plan, setPlan] = useState("free");
  const [loadingPlan, setLoadingPlan] = useState(true);

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

  if (loadingPlan) {
    return (
      <div className="card">
        <p className="page-lead">Checking your plan…</p>
      </div>
    );
  }

  if (plan === "premium") {
    return children;
  }

  return <Navigate to="/profile" replace />;
}
