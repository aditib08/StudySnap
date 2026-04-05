import { useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase.js";
import { ensureUserProfile, normalizeUserEmail } from "../userProfile.js";

/** Any friendRequests between two users (either direction). */
async function fetchPairFriendRequests(meId, themId) {
  const qOut = query(
    collection(db, "friendRequests"),
    where("fromUserId", "==", meId),
    where("toUserId", "==", themId)
  );
  const qIn = query(
    collection(db, "friendRequests"),
    where("fromUserId", "==", themId),
    where("toUserId", "==", meId)
  );
  const [outSnap, inSnap] = await Promise.all([getDocs(qOut), getDocs(qIn)]);
  return [...outSnap.docs, ...inSnap.docs].map((d) => ({ id: d.id, ...d.data() }));
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

    const normalized = normalizeUserEmail(email);
    if (!normalized) return;

    setLoading(true);
    setStatus(null);

    try {
      await ensureUserProfile(user);

      const q = query(
        collection(db, "users"),
        where("email", "==", normalized),
        limit(2)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setStatus({
          type: "error",
          text:
            "No account with that email found. They need to sign in to StudySnap at least once so their profile exists.",
        });
        return;
      }

      const friendDoc = snap.docs[0];
      const friendId = friendDoc.id;
      const toEmail = normalizeUserEmail(friendDoc.data()?.email ?? normalized);

      if (friendId === user.uid) {
        setStatus({
          type: "error",
          text: "You can't add yourself.",
        });
        return;
      }

      const meRef = doc(db, "users", user.uid);
      const meSnap = await getDoc(meRef);
      const friendsList = Array.isArray(meSnap.data()?.friends)
        ? meSnap.data().friends
        : [];
      if (friendsList.includes(friendId)) {
        setStatus({
          type: "error",
          text: "You're already friends with this user.",
        });
        return;
      }

      const pair = await fetchPairFriendRequests(user.uid, friendId);
      for (const r of pair) {
        const st = r.status;
        if (st === "accepted") {
          setStatus({
            type: "error",
            text: "You're already friends with this user.",
          });
          return;
        }
        if (st === "pending") {
          if (r.fromUserId === user.uid) {
            setStatus({
              type: "error",
              text: "You already sent a friend request to this person.",
            });
          } else {
            setStatus({
              type: "error",
              text: "This person already sent you a friend request.",
            });
          }
          return;
        }
      }

      const fromEmail = normalizeUserEmail(user.email ?? "");

      await addDoc(collection(db, "friendRequests"), {
        fromUserId: user.uid,
        fromUserEmail: fromEmail,
        toUserId: friendId,
        toUserEmail: toEmail,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setStatus({ type: "success", text: "Request sent!" });
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
      <p className="card-desc">
        Enter a friend&apos;s account email to send them a friend request.
      </p>
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
          {loading ? "…" : "Send request"}
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
