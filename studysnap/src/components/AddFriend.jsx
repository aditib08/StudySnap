import { useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { auth, db } from "../firebase.js";
import { ensureUserProfile } from "../userProfile.js";

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export default function AddFriend() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      setStatus({ type: "error", text: "Sign in to add friends." });
      return;
    }

    const normalized = normalizeEmail(email);
    if (!normalized) return;

    setLoading(true);
    setStatus(null);

    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", normalized),
        limit(2)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setStatus({
          type: "error",
          text: "No user found with that email",
        });
        return;
      }

      const friendDoc = snap.docs[0];
      const friendId = friendDoc.id;

      if (friendId === user.uid) {
        setStatus({
          type: "error",
          text: "You can't add yourself.",
        });
        return;
      }

      await ensureUserProfile(user);
      const meRef = doc(db, "users", user.uid);
      const meSnap = await getDoc(meRef);
      const existing = meSnap.data()?.friends;
      const list = Array.isArray(existing) ? existing : [];
      if (list.includes(friendId)) {
        setStatus({
          type: "error",
          text: "Already in your friends list.",
        });
        return;
      }

      await updateDoc(meRef, {
        friends: arrayUnion(friendId),
      });

      setStatus({ type: "success", text: "Friend added!" });
      setEmail("");
    } catch (err) {
      setStatus({
        type: "error",
        text: err.message || "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card add-friend">
      <h2 className="card-title">Add a friend</h2>
      <p className="card-desc">Enter a friend&apos;s account email to see their snaps.</p>
      <form className="add-friend-form" onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="friend@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Friend email"
          disabled={loading}
        />
        <button
          type="submit"
          className="btn btn-secondary"
          disabled={loading}
        >
          {loading ? "…" : "Add"}
        </button>
      </form>
      {status?.type === "success" && (
        <p className="add-friend-toast add-friend-success" role="status">
          {status.text}
        </p>
      )}
      {status?.type === "error" && (
        <p className="form-error add-friend-error" role="alert">
          {status.text}
        </p>
      )}
    </div>
  );
}
