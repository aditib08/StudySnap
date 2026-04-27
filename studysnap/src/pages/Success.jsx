import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";

export default function Success() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user?.uid) {
        navigate("/profile", { replace: true });
        return;
      }
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { plan: "premium" },
          { merge: true }
        );
      } finally {
        navigate("/", { replace: true });
      }
    });
    return () => unsub();
  }, [navigate]);

  return (
    <div className="page">
      <p className="page-lead">Finalizing your premium upgrade…</p>
    </div>
  );
}
