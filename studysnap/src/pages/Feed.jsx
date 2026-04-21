import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  serverTimestamp,
  doc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase.js";
import { ensureUserProfile } from "../userProfile.js";
import { recomputeUserStreak } from "../userStreak.js";
import { resolveAuthorLabel } from "../syncPostAuthorLabels.js";
import { uploadHomeworkImage } from "../uploadHomeworkImage.js";
import PostCard from "../components/PostCard.jsx";
import SnapPrompt from "../components/SnapPrompt.jsx";
import AddFriend from "../components/AddFriend.jsx";
import FriendsList from "../components/FriendsList.jsx";
import FriendRequests from "../components/FriendRequests.jsx";

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapPostDoc(docSnap) {
  const d = docSnap.data();
  const createdAt = d.createdAt;
  return {
    id: docSnap.id,
    authorId: d.authorId ?? "",
    author: d.authorLabel?.trim() || "User",
    body: d.body ?? "",
    imageUrl: typeof d.imageUrl === "string" ? d.imageUrl : "",
    upvotes: Array.isArray(d.upvotes) ? d.upvotes : [],
    downvotes: Array.isArray(d.downvotes) ? d.downvotes : [],
    _sort: createdAt?.seconds ?? 0,
  };
}

function sortKey(a, b) {
  return b._sort - a._sort;
}

export default function Feed() {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [currentUserEmail, setCurrentUserEmail] = useState(
    () => auth.currentUser?.email ?? ""
  );
  /** Firestore `users/{uid}.displayName` — drives labels with email fallback */
  const [profileDisplayName, setProfileDisplayName] = useState("");
  /** UIDs from `users/{uid}.friends` — populated when friend requests are accepted */
  const [friendIds, setFriendIds] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const chunkMapsRef = useRef([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setCurrentUserEmail(user?.email ?? "");
      if (user) ensureUserProfile(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setFriendIds([]);
      setProfileDisplayName("");
      setFriendsLoading(false);
      return;
    }
    setFriendsLoading(true);
    const userRef = doc(db, "users", uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.data();
        const friends = data?.friends;
        setFriendIds(Array.isArray(friends) ? friends : []);
        setProfileDisplayName((data?.displayName ?? "").trim());
        setFriendsLoading(false);
      },
      () => setFriendsLoading(false)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    recomputeUserStreak(db, uid).catch(() => {
      // Keep feed usable even if streak recompute fails.
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setPosts([]);
      return;
    }

    /** Your posts plus posts from everyone in your accepted `friends` list */
    const authorIds = [...new Set([uid, ...friendIds])];
    const chunks = chunkArray(authorIds, 10);
    chunkMapsRef.current = chunks.map(() => new Map());

    function mergeAndSet() {
      const merged = new Map();
      chunkMapsRef.current.forEach((m) => {
        m.forEach((v, k) => merged.set(k, v));
      });
      const list = [...merged.values()].sort(sortKey);
      setPosts(list.map(({ _sort, ...rest }) => rest));
    }

    const unsubs = chunks.map((chunk, i) => {
      const q = query(
        collection(db, "posts"),
        where("authorId", "in", chunk)
      );
      return onSnapshot(q, (snap) => {
        const m = new Map();
        snap.docs.forEach((d) => {
          const post = mapPostDoc(d);
          m.set(d.id, post);
        });
        chunkMapsRef.current[i] = m;
        mergeAndSet();
      });
    });

    return () => unsubs.forEach((u) => u());
  }, [uid, friendIds]);

  async function handleNewPost({ text, imageFile }) {
    const user = auth.currentUser;
    if (!user) return;
    const trimmed = (text ?? "").trim();
    if (!trimmed && !imageFile) return;
    let imageUrl = null;
    if (imageFile) {
      imageUrl = await uploadHomeworkImage(user.uid, imageFile);
    }
    await addDoc(collection(db, "posts"), {
      authorId: user.uid,
      body: trimmed,
      ...(imageUrl ? { imageUrl } : {}),
      upvotes: [],
      downvotes: [],
      createdAt: serverTimestamp(),
      authorLabel: resolveAuthorLabel(profileDisplayName, user.email ?? ""),
    });
  }

  async function handleDeletePost(postId) {
    const user = auth.currentUser;
    if (!user || !postId) return;
    const ok = window.confirm("Remove this post from your feed?");
    if (!ok) return;
    await deleteDoc(doc(db, "posts", postId));
    await recomputeUserStreak(db, user.uid);
  }

  const hasFriends = friendIds.length > 0;
  const currentUserLabel = resolveAuthorLabel(
    profileDisplayName,
    currentUserEmail
  );

  return (
    <div className="page feed-page">
      <div className="feed-layout">
        <div className="feed-sidebar-column">
          <FriendsList />
          <FriendRequests />
        </div>
        <div className="feed-main-column">
          <h1 className="page-title">Feed</h1>
          <p className="page-lead feed-intro">
            Share assignment updates and photos. Your feed includes your posts
            and posts from friends you&apos;ve accepted (from your friends list).
          </p>
          <SnapPrompt onSubmit={handleNewPost} />
          <AddFriend />
          <section
            className="feed-list"
            aria-label="Your posts and posts from accepted friends"
          >
            {friendsLoading ? (
              <p className="page-lead">Loading feed…</p>
            ) : (
              <>
                {!hasFriends && (
                  <p className="feed-empty">
                    No friends yet — add friends to see their posts
                  </p>
                )}
                {posts.length === 0 ? (
                  hasFriends ? (
                    <p className="page-lead">No posts yet.</p>
                  ) : null
                ) : (
                  posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUserId={uid}
                      currentUserEmail={currentUserEmail}
                      currentUserLabel={currentUserLabel}
                      onDelete={
                        uid != null && post.authorId === uid
                          ? () => handleDeletePost(post.id)
                          : undefined
                      }
                    />
                  ))
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
