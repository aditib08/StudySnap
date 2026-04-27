import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";

export default function Success() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Finalizing your premium upgrade…");

  useEffect(() => {
    let timerId;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user?.uid) {
        setStatus("Sign in required. Redirecting…");
        timerId = window.setTimeout(() => {
          navigate("/profile", { replace: true });
        }, 1200);
        return;
      }
      setDoc(doc(db, "users", user.uid), { plan: "premium" }, { merge: true })
        .then(() => {
          setStatus("Premium unlocked! Taking you home…");
          timerId = window.setTimeout(() => {
            navigate("/", { replace: true });
          }, 2000);
        })
        .catch(() => {
          setStatus("Could not update premium status. Redirecting to profile…");
          timerId = window.setTimeout(() => {
            navigate("/profile", { replace: true });
          }, 2000);
        });
    });
    return () => {
      unsub();
      if (timerId) window.clearTimeout(timerId);
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
