import { doc, runTransaction } from "firebase/firestore";
import { recomputeUserStreak } from "./userStreak.js";

/**
 * Toggle/switch validation on a post. Same button removes vote; the other moves it.
 * @param {"up" | "down"} direction
 */
export async function setPostVote(db, postId, uid, direction) {
  const ref = doc(db, "posts", postId);
  let authorId = "";
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error("Post not found");
    }
    const d = snap.data();
    authorId = d.authorId ?? "";
    let upvotes = Array.isArray(d.upvotes) ? [...d.upvotes] : [];
    let downvotes = Array.isArray(d.downvotes) ? [...d.downvotes] : [];
    const inUp = upvotes.includes(uid);
    const inDown = downvotes.includes(uid);

    if (direction === "up") {
      if (inUp) {
        upvotes = upvotes.filter((id) => id !== uid);
      } else {
        downvotes = downvotes.filter((id) => id !== uid);
        if (!upvotes.includes(uid)) upvotes.push(uid);
      }
    } else {
      if (inDown) {
        downvotes = downvotes.filter((id) => id !== uid);
      } else {
        upvotes = upvotes.filter((id) => id !== uid);
        if (!downvotes.includes(uid)) downvotes.push(uid);
      }
    }

    transaction.update(ref, { upvotes, downvotes });
  });
  if (authorId) {
    await recomputeUserStreak(db, authorId);
  }
}
