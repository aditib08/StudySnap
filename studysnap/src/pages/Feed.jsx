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
import { uploadHomeworkImage } from "../uploadHomeworkImage.js";
import PostCard from "../components/PostCard.jsx";
import SnapPrompt from "../components/SnapPrompt.jsx";
import AddFriend from "../components/AddFriend.jsx";

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatRelativeTime(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mapPostDoc(docSnap) {
  const d = docSnap.data();
  const createdAt = d.createdAt;
  const date = createdAt?.toDate?.();
  return {
    id: docSnap.id,
    authorId: d.authorId ?? "",
    author: d.authorLabel?.trim() || "User",
    body: d.body ?? "",
    imageUrl: typeof d.imageUrl === "string" ? d.imageUrl : "",
    time: formatRelativeTime(createdAt),
    dateTime: date ? date.toISOString() : "",
    _sort: createdAt?.seconds ?? 0,
  };
}

function sortKey(a, b) {
  return b._sort - a._sort;
}

export default function Feed() {
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [friendIds, setFriendIds] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const chunkMapsRef = useRef([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      if (user) ensureUserProfile(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setFriendIds([]);
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
        setFriendsLoading(false);
      },
      () => setFriendsLoading(false)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setPosts([]);
      return;
    }

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
      createdAt: serverTimestamp(),
      authorLabel: user.displayName?.trim() || user.email || "User",
    });
  }

  async function handleDeletePost(postId) {
    const user = auth.currentUser;
    if (!user || !postId) return;
    const ok = window.confirm("Remove this post from your feed?");
    if (!ok) return;
    await deleteDoc(doc(db, "posts", postId));
  }

  const hasFriends = friendIds.length > 0;

  return (
    <div className="page feed-page">
      <h1 className="page-title">Feed</h1>
      <p className="page-lead feed-intro">
        Share assignment updates and photos. You and your friends see each other’s posts here.
      </p>
      <SnapPrompt onSubmit={handleNewPost} />
      <AddFriend />
      <section className="feed-list" aria-label="Assignment posts from you and your friends">
        {friendsLoading ? (
          <p className="page-lead">Loading feed…</p>
        ) : (
          <>
            {!hasFriends && (
              <p className="feed-empty">
                Add friends to see their posts here.
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
  );
}
