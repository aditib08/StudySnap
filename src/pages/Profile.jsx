import { useState, useEffect } from "react";
import { onAuthStateChanged, reload, updateProfile } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase.js";
import { ensureUserProfile } from "../userProfile.js";
import { recomputeUserStreak } from "../userStreak.js";
import FriendsList from "../components/FriendsList.jsx";
import PremiumGate from "../components/PremiumGate.jsx";
import {
  resolveAuthorLabel,
  syncPostAuthorLabels,
  syncUserCommentLabels,
} from "../syncPostAuthorLabels.js";

function getBlockDurationMinutes(block) {
  const [sh = 0, sm = 0] = String(block?.time ?? "00:00")
    .split(":")
    .map(Number);
  const [eh = sh, em = sm] = String(block?.endTime ?? block?.time ?? "00:00")
    .split(":")
    .map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

function formatMinutes(totalMin) {
  const mins = Math.max(0, Math.round(totalMin));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function Profile() {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [email, setEmail] = useState(() => auth.currentUser?.email ?? "");
  const [formName, setFormName] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [friendCount, setFriendCount] = useState(0);
  const [streakCount, setStreakCount] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [plan, setPlan] = useState("free");
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setEmail(user?.email ?? "");
      if (user) ensureUserProfile(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setFormName("");
      setSavedDisplayName("");
      setFriendCount(0);
      setStreakCount(0);
      setLongestStreak(0);
      setScheduleBlocks([]);
      return;
    }
    const ref = doc(db, "users", uid);
    return onSnapshot(ref, (snap) => {
      const d = snap.data();
      const name = (d?.displayName ?? "").trim();
      setSavedDisplayName(name);
      setFormName(name);
      const friends = Array.isArray(d?.friends) ? d.friends.length : 0;
      setFriendCount(Math.max(0, friends));
      const sc = d?.streakCount;
      const ls = d?.longestStreak;
      const nextPlan = String(d?.plan ?? "free").toLowerCase();
      setPlan(nextPlan === "premium" ? "premium" : "free");
      setStreakCount(Number.isFinite(sc) ? Math.max(0, sc) : 0);
      setLongestStreak(Number.isFinite(ls) ? Math.max(0, ls) : 0);
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, "users", uid, "scheduleBlocks");
    return onSnapshot(ref, (snap) => {
      setScheduleBlocks(snap.docs.map((d) => d.data()));
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    recomputeUserStreak(db, uid).catch(() => {});
  }, [uid]);

  async function handleSaveDisplayName(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    const trimmed = formName.trim();
    setSaving(true);
    setMessage(null);
    try {
      const authorLabel = resolveAuthorLabel(trimmed, user.email);
      await updateProfile(user, { displayName: trimmed || null });
      await setDoc(
        doc(db, "users", user.uid),
        { displayName: trimmed },
        { merge: true }
      );
      await syncPostAuthorLabels(db, user.uid, authorLabel);
      await syncUserCommentLabels(db, user.uid, authorLabel);
      try {
        await reload(user);
      } catch {
        /* Firestore + posts already updated; navbar uses profile snapshot */
      }
      setMessage({ type: "success", text: "Display name saved." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err?.message ?? "Could not save display name.",
      });
    } finally {
      setSaving(false);
    }
  }

  const showName =
    savedDisplayName ||
    auth.currentUser?.displayName?.trim() ||
    "";
  const totalMinutes = scheduleBlocks.reduce(
    (sum, b) => sum + getBlockDurationMinutes(b),
    0
  );
  const avgSessionMinutes =
    scheduleBlocks.length > 0 ? totalMinutes / scheduleBlocks.length : 0;
  const byDay = new Map();
  const byLabel = new Map();
  for (const block of scheduleBlocks) {
    const duration = getBlockDurationMinutes(block);
    const day = String(block?.day ?? "Unknown");
    const label = String(block?.label ?? "Unlabeled").trim() || "Unlabeled";
    byDay.set(day, (byDay.get(day) || 0) + duration);
    byLabel.set(label, (byLabel.get(label) || 0) + duration);
  }
  const dayEntries = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
  const labelEntries = [...byLabel.entries()].sort((a, b) => b[1] - a[1]);
  const mostFocusedDay = dayEntries[0] ?? null;
  const leastFocusedDay = dayEntries[dayEntries.length - 1] ?? null;
  const topAssignments = labelEntries.slice(0, 3);

  if (!uid) {
    return (
      <div className="page profile-page">
        <p className="page-lead">Sign in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <h1 className="page-title">Profile</h1>
      <p className="page-lead profile-lead">
        Your account details and study streak stats.
      </p>

      <section className="card profile-card" aria-labelledby="profile-account-heading">
        <h2 id="profile-account-heading" className="profile-section-title">
          Account
        </h2>
        <dl className="profile-dl">
          <div className="profile-dl-row">
            <dt>Email</dt>
            <dd>{email || "—"}</dd>
          </div>
          <div className="profile-dl-row">
            <dt>Name shown in StudySnap</dt>
            <dd>{showName || email || "—"}</dd>
          </div>
          <div className="profile-dl-row">
            <dt>Friends</dt>
            <dd>
              <strong>{friendCount}</strong> {friendCount === 1 ? "friend" : "friends"}
            </dd>
          </div>
        </dl>

        <form className="profile-display-form" onSubmit={handleSaveDisplayName}>
          <div className="field">
            <label htmlFor="profile-display-name">Display name</label>
            <input
              id="profile-display-name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={80}
            />
            <span className="profile-field-hint">
              This appears on your posts, comments, and to friends. Leave blank to
              show your email instead.
            </span>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save display name"}
          </button>
          {message ? (
            <p
              className={
                message.type === "error" ? "form-error" : "profile-save-toast"
              }
              role={message.type === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          ) : null}
        </form>
      </section>

      <FriendsList />

      {plan === "premium" ? (
        <>
          <section className="card profile-card" aria-labelledby="profile-streaks-heading">
            <h2 id="profile-streaks-heading" className="profile-section-title">
              Streaks
            </h2>
            <dl className="profile-dl profile-dl--streaks">
              <div className="profile-dl-row">
                <dt>
                  <span aria-hidden="true">🔥</span> Current streak
                </dt>
                <dd>
                  <strong>{streakCount}</strong>{" "}
                  {streakCount === 1 ? "day" : "days"} in a row
                </dd>
              </div>
              <div className="profile-dl-row">
                <dt>
                  <span aria-hidden="true">🏆</span> Longest streak
                </dt>
                <dd>
                  <strong>{longestStreak}</strong>{" "}
                  {longestStreak === 1 ? "day" : "days"} (best run of confirmed snaps)
                </dd>
              </div>
            </dl>
          </section>
          <section className="card profile-card" aria-labelledby="profile-insights-heading">
            <h2 id="profile-insights-heading" className="profile-section-title">
              Study habits insights
            </h2>
            {scheduleBlocks.length === 0 ? (
              <p className="page-lead">
                Add schedule blocks to unlock personalized study habit analytics.
              </p>
            ) : (
              <>
                <dl className="profile-dl">
                  <div className="profile-dl-row">
                    <dt>Average session length</dt>
                    <dd>
                      <strong>{formatMinutes(avgSessionMinutes)}</strong>
                    </dd>
                  </div>
                  <div className="profile-dl-row">
                    <dt>Most focused day</dt>
                    <dd>
                      <strong>{mostFocusedDay?.[0] ?? "—"}</strong>{" "}
                      {mostFocusedDay ? `(${formatMinutes(mostFocusedDay[1])})` : ""}
                    </dd>
                  </div>
                  <div className="profile-dl-row">
                    <dt>Least focused day</dt>
                    <dd>
                      <strong>{leastFocusedDay?.[0] ?? "—"}</strong>{" "}
                      {leastFocusedDay ? `(${formatMinutes(leastFocusedDay[1])})` : ""}
                    </dd>
                  </div>
                </dl>
                <h3 className="profile-section-title">Top classes/assignments by time</h3>
                <ul className="friends-list">
                  {topAssignments.map(([label, minutes]) => (
                    <li key={label} className="friends-list-item">
                      <span className="friends-list-name">
                        {label} - {formatMinutes(minutes)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      ) : (
        <section className="card profile-card" aria-labelledby="profile-streaks-locked-heading">
          <h2 id="profile-streaks-locked-heading" className="profile-section-title">
            Streaks (Premium)
          </h2>
          <p className="page-lead">Upgrade to unlock streak details.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowPremiumModal(true)}
          >
            Upgrade
          </button>
        </section>
      )}
      <PremiumGate
        isOpen={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
      />
    </div>
  );
}
