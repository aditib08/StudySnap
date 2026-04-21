import { useState, useEffect } from "react";
import { onAuthStateChanged, reload, updateProfile } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase.js";
import { ensureUserProfile } from "../userProfile.js";
import { recomputeUserStreak } from "../userStreak.js";
import {
  resolveAuthorLabel,
  syncPostAuthorLabels,
  syncUserCommentLabels,
} from "../syncPostAuthorLabels.js";

export default function Profile() {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [email, setEmail] = useState(() => auth.currentUser?.email ?? "");
  const [formName, setFormName] = useState("");
  const [savedDisplayName, setSavedDisplayName] = useState("");
  const [streakCount, setStreakCount] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
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
      setStreakCount(0);
      setLongestStreak(0);
      return;
    }
    const ref = doc(db, "users", uid);
    return onSnapshot(ref, (snap) => {
      const d = snap.data();
      const name = (d?.displayName ?? "").trim();
      setSavedDisplayName(name);
      setFormName(name);
      const sc = d?.streakCount;
      const ls = d?.longestStreak;
      setStreakCount(Number.isFinite(sc) ? Math.max(0, sc) : 0);
      setLongestStreak(Number.isFinite(ls) ? Math.max(0, ls) : 0);
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
    </div>
  );
}
