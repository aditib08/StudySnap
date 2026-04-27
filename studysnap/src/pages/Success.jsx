import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase.js";

function getBlockMinutes(block) {
  const [sh = 0, sm = 0] = String(block?.time ?? "00:00").split(":").map(Number);
  const [eh = sh, em = sm] = String(block?.endTime ?? block?.time ?? "00:00")
    .split(":")
    .map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

function buildTips(blocks) {
  if (!blocks.length) {
    return [
      "Set 3 focused study blocks this week so your premium insights can coach your rhythm.",
      "Keep each session to one clear goal (for example: finish problem set #4).",
      "After each block, post a quick StudySnap recap to reinforce retention.",
    ];
  }
  const totalMin = blocks.reduce((sum, b) => sum + getBlockMinutes(b), 0);
  const avgMin = Math.round(totalMin / blocks.length);
  const dayTotals = new Map();
  blocks.forEach((b) => {
    const day = String(b?.day ?? "Unknown");
    dayTotals.set(day, (dayTotals.get(day) || 0) + getBlockMinutes(b));
  });
  const rankedDays = [...dayTotals.entries()].sort((a, b) => b[1] - a[1]);
  const bestDay = rankedDays[0]?.[0];
  const weakerDay = rankedDays[rankedDays.length - 1]?.[0];
  return [
    `Your average planned session is about ${avgMin} minutes. Keep it near this length for consistency.`,
    bestDay
      ? `${bestDay} looks like your strongest focus day. Schedule harder work there first.`
      : "Front-load your toughest classwork on your most energetic day.",
    weakerDay
      ? `Add one short 30-minute block on ${weakerDay} to balance your weekly momentum.`
      : "Add one short backup session on a lighter day to avoid weekly gaps.",
  ];
}

export default function Success() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Activating your premium...");
  const [tips, setTips] = useState([]);

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
      Promise.all([
        setDoc(doc(db, "users", user.uid), { plan: "premium" }, { merge: true }),
        getDocs(collection(db, "users", user.uid, "scheduleBlocks")),
      ])
        .then(([, scheduleSnap]) => {
          setTips(buildTips(scheduleSnap.docs.map((d) => d.data())));
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
        {tips.length > 0 ? (
          <ul className="friends-list" aria-label="Personal study tips">
            {tips.map((tip) => (
              <li key={tip} className="friends-list-item">
                <span className="friends-list-name">{tip}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
