import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  writeBatch,
  arrayUnion,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase.js";
import { normalizeUserEmail } from "../userProfile.js";

export default function FriendRequests() {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "friendRequests"),
      where("toUserId", "==", uid),
      where("status", "==", "pending")
    );
    return onSnapshot(
      q,
      (snap) => {
        setRequests(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setRequests([]);
        setLoading(false);
        setError(err?.message || "Could not load requests.");
      }
    );
  }, [uid]);

  async function handleAccept(r) {
    const fromId = r.fromUserId;
    const toId = r.toUserId;
    if (!fromId || !toId || busyId) return;
    setError(null);
    setBusyId(r.id);
    try {
      const batch = writeBatch(db);
      const reqRef = doc(db, "friendRequests", r.id);
      batch.update(reqRef, { status: "accepted" });
      const fromEmail = normalizeUserEmail(r.fromUserEmail);
      const toEmail = normalizeUserEmail(r.toUserEmail);
      /** merge: true + arrayUnion keeps both users symmetric even if a user doc was missing */
      batch.set(
        doc(db, "users", fromId),
        {
          ...(fromEmail ? { email: fromEmail } : {}),
          friends: arrayUnion(toId),
        },
        { merge: true }
      );
      batch.set(
        doc(db, "users", toId),
        {
          ...(toEmail ? { email: toEmail } : {}),
          friends: arrayUnion(fromId),
        },
        { merge: true }
      );
      await batch.commit();
    } catch (e) {
      setError(e?.message || "Could not accept request.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(r) {
    if (busyId) return;
    setError(null);
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, "friendRequests", r.id), {
        status: "declined",
      });
    } catch (e) {
      setError(e?.message || "Could not decline request.");
    } finally {
      setBusyId(null);
    }
  }

  if (!uid) {
    return null;
  }

  return (
    <aside className="friend-requests card" aria-label="Friend requests">
      <h2 className="friend-requests-title">Requests</h2>
      {loading ? (
        <p className="friend-requests-empty">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="friend-requests-empty">No pending requests</p>
      ) : (
        <ul className="friend-requests-list">
          {requests.map((r) => {
            const email = (r.fromUserEmail ?? "").trim() || "Unknown user";
            const isBusy = busyId === r.id;
            return (
              <li key={r.id} className="friend-request-item">
                <p className="friend-request-email">{email}</p>
                <div className="friend-request-actions">
                  <button
                    type="button"
                    className="btn btn-primary friend-request-btn"
                    onClick={() => handleAccept(r)}
                    disabled={Boolean(busyId)}
                    aria-busy={isBusy}
                  >
                    {isBusy ? "…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary friend-request-btn"
                    onClick={() => handleDecline(r)}
                    disabled={Boolean(busyId)}
                  >
                    {isBusy ? "…" : "Decline"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p className="form-error friend-requests-error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
