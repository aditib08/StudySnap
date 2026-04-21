import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

function toLocalDayKey(value) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCurrentStreakFromDaySet(daySet) {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (daySet.has(toLocalDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function isConfirmedPost(post) {
  const upvotes = Array.isArray(post.upvotes) ? post.upvotes : [];
  const downvotes = Array.isArray(post.downvotes) ? post.downvotes : [];
  return upvotes.length > downvotes.length;
}

/**
 * Recomputes and stores the user's current streak:
 * consecutive days (ending today) with at least one confirmed post.
 */
export async function recomputeUserStreak(db, userId) {
  if (!userId) return 0;
  const postsQuery = query(
    collection(db, "posts"),
    where("authorId", "==", userId)
  );
  const snap = await getDocs(postsQuery);
  const confirmedDays = new Set();

  snap.forEach((postDoc) => {
    const d = postDoc.data();
    if (!isConfirmedPost(d)) return;
    const createdAt = d.createdAt?.toDate?.();
    if (!createdAt) return;
    confirmedDays.add(toLocalDayKey(createdAt));
  });

  const streakCount = getCurrentStreakFromDaySet(confirmedDays);
  await setDoc(doc(db, "users", userId), { streakCount }, { merge: true });
  return streakCount;
}
