import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase.js";

/** Lowercase trimmed email for Firestore queries and `users/{uid}.email` */
export function normalizeUserEmail(value) {
  return (value ?? "").trim().toLowerCase();
}

export async function ensureUserProfile(user) {
  if (!user?.uid) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const email = normalizeUserEmail(user.email);
  if (!snap.exists()) {
    await setDoc(ref, {
      email,
      displayName: "",
      createdAt: serverTimestamp(),
      friends: [],
    });
  } else {
    await setDoc(ref, { email }, { merge: true });
  }
}

export async function recordUserLogin(user) {
  if (!user?.uid) return;
  const ref = doc(db, "users", user.uid);
  await setDoc(
    ref,
    {
      loginCount: increment(1),
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
}
