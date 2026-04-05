import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase.js";

function displayLabel(profile) {
  if (!profile) return "…";
  const name = profile.displayName?.trim();
  if (name) return name;
  const email = profile.email?.trim();
  if (email) return email;
  return "Unknown user";
}

/**
 * Lists accepted friends from the `friends` array on your user doc (updated when
 * requests are accepted — not by AddFriend, which only creates `friendRequests`).
 */
export default function FriendsList() {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [friendIds, setFriendIds] = useState([]);
  const [friendProfiles, setFriendProfiles] = useState({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setFriendIds([]);
      return;
    }
    const userRef = doc(db, "users", uid);
    return onSnapshot(userRef, (snap) => {
      const raw = snap.data()?.friends;
      setFriendIds(Array.isArray(raw) ? raw : []);
    });
  }, [uid]);

  const friendIdsKey = friendIds.join("|");

  useEffect(() => {
    if (!uid || friendIds.length === 0) {
      setFriendProfiles({});
      return;
    }
    setFriendProfiles({});
    const unsubs = friendIds.map((friendId) =>
      onSnapshot(doc(db, "users", friendId), (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setFriendProfiles((prev) => ({
          ...prev,
          [friendId]: {
            displayName: (d?.displayName ?? "").trim(),
            email: (d?.email ?? "").trim(),
          },
        }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [uid, friendIdsKey]);

  if (!uid) {
    return null;
  }

  return (
    <aside className="friends-sidebar card" aria-label="Your friends">
      <h2 className="friends-sidebar-title">Friends</h2>
      {friendIds.length === 0 ? (
        <p className="friends-sidebar-empty">No friends yet</p>
      ) : (
        <ul className="friends-list">
          {friendIds.map((id) => (
            <li key={id} className="friends-list-item">
              <span className="friends-list-name">
                {displayLabel(friendProfiles[id])}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
