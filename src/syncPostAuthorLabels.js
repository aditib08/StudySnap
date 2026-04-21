import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

const FIRESTORE_BATCH_LIMIT = 500;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Shown name on posts and comments: non-empty display name, else account email.
 * (Empty saved name → use email everywhere.)
 */
export function resolveAuthorLabel(trimmedDisplayName, email) {
  const t = (trimmedDisplayName ?? "").trim();
  if (t) return t;
  const e = (email ?? "").trim();
  return e || "User";
}

/**
 * Sets `authorLabel` on every post authored by `userId` (matches Feed / SnapPrompt).
 */
export async function syncPostAuthorLabels(db, userId, authorLabel) {
  if (!userId) return;
  const q = query(
    collection(db, "posts"),
    where("authorId", "==", userId)
  );
  const snap = await getDocs(q);
  const ids = snap.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = ids.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.update(doc(db, "posts", id), { authorLabel });
    });
    await batch.commit();
  }
}

/**
 * Sets `userLabel` on every comment by this user.
 * Uses per-post subqueries (friends + your posts) so no collection-group index is required.
 * Comments on posts by people not in your current friends list are skipped.
 */
export async function syncUserCommentLabels(db, userId, userLabel) {
  if (!userId) return;

  const userSnap = await getDoc(doc(db, "users", userId));
  const friends = Array.isArray(userSnap.data()?.friends)
    ? userSnap.data().friends
    : [];
  const authorIds = [...new Set([userId, ...friends])];

  const postIds = new Set();
  for (const chunk of chunkArray(authorIds, 10)) {
    if (chunk.length === 0) continue;
    const pq = query(collection(db, "posts"), where("authorId", "in", chunk));
    const ps = await getDocs(pq);
    ps.docs.forEach((d) => postIds.add(d.id));
  }

  const refs = [];
  for (const postId of postIds) {
    const cq = query(
      collection(db, "posts", postId, "comments"),
      where("userId", "==", userId)
    );
    const cs = await getDocs(cq);
    cs.docs.forEach((d) => refs.push(d.ref));
  }

  for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = refs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.update(ref, { userLabel }));
    await batch.commit();
  }
}
