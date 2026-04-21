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

/** Longest run of consecutive calendar days in `daySet` (sorted by date). */
function longestConsecutiveRunFromDaySet(daySet) {
  if (daySet.size === 0) return 0;
  const keys = [...daySet].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i += 1) {
    const [py, pm, pd] = keys[i - 1].split("-").map(Number);
    const [cy, cm, cd] = keys[i].split("-").map(Number);
    const prev = new Date(py, pm - 1, pd).getTime();
    const curr = new Date(cy, cm - 1, cd).getTime();
    const dayDiff = Math.round((curr - prev) / 86400000);
    if (dayDiff === 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
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
  const longestStreak = longestConsecutiveRunFromDaySet(confirmedDays);
  await setDoc(
    doc(db, "users", userId),
    { streakCount, longestStreak },
    { merge: true }
  );
  return streakCount;
}
