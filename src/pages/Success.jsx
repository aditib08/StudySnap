import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";

export default function Success() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Activating your premium...");

  useEffect(() => {
    let timeoutId;
    let redirectId;
    let resolved = false;

    timeoutId = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      setStatus("Could not confirm login. Redirecting to login…");
      navigate("/login", { replace: true });
    }, 5000);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (resolved) return;
      if (!user?.uid) {
        return;
      }
      resolved = true;
      window.clearTimeout(timeoutId);
      setDoc(doc(db, "users", user.uid), { plan: "premium" }, { merge: true })
        .then(() => {
          setStatus("Premium unlocked! Taking you back to your profile…");
          redirectId = window.setTimeout(() => {
            navigate("/profile", { replace: true });
          }, 2000);
        })
        .catch(() => {
          setStatus("Could not update premium status. Redirecting to profile…");
          redirectId = window.setTimeout(() => {
            navigate("/profile", { replace: true });
          }, 2000);
        });
    });
    return () => {
      unsub();
      if (timeoutId) window.clearTimeout(timeoutId);
      if (redirectId) window.clearTimeout(redirectId);
    };
  }, [navigate]);

  return (
    <div className="page success-page">
      <div className="success-status-card card" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true" />
        <p className="page-lead">{status}</p>
      </div>
    </div>
  );
}
