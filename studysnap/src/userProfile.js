import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";

export async function ensureUserProfile(user) {
  if (!user?.uid) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const email = (user.email ?? "").trim().toLowerCase();
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
