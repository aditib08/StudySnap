import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";

const EMOJI_PICKER_EMOJIS = [
  "😊",
  "😂",
  "❤️",
  "👍",
  "🎉",
  "🔥",
  "✨",
  "🙏",
  "😭",
  "😍",
  "🤔",
  "👏",
  "💯",
  "📚",
  "✏️",
  "📝",
  "✅",
  "🙌",
  "💪",
  "👀",
];

export default function PostComments({
  postId,
  postAuthorId,
  currentUserId,
  currentUserEmail,
}) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!postId) return;
    const q = query(
      collection(db, "posts", postId, "comments"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(
      q,
      (snap) => {
        setComments(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (err) => {
        console.error(err);
        setComments([]);
      }
    );
  }, [postId]);

  useEffect(() => {
    if (!emojiOpen) return;
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setEmojiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emojiOpen]);

  const isOwnPost =
    Boolean(currentUserId && postAuthorId) && currentUserId === postAuthorId;

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !currentUserId || isOwnPost) return;
    setError(null);
    setSubmitting(true);
    try {
      await addDoc(collection(db, "posts", postId, "comments"), {
        userId: currentUserId,
        userEmail: (currentUserEmail ?? "").trim() || "unknown",
        text: trimmed,
        createdAt: serverTimestamp(),
      });
      setText("");
      setEmojiOpen(false);
    } catch (err) {
      setError(err?.message || "Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  function insertEmoji(emoji) {
    const el = inputRef.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next =
        text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setText((t) => t + emoji);
    }
  }

  if (!postId) return null;

  return (
    <div className="post-comments">
      <h3 className="post-comments-heading">Comments</h3>
      <ul className="post-comments-list" aria-label="Comments on this post">
        {comments.length === 0 ? (
          <li className="post-comments-empty">No comments yet.</li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="post-comment-item">
              <span className="post-comment-email">
                {(c.userEmail ?? "").trim() || "Unknown"}
              </span>
              <p className="post-comment-text">{c.text ?? ""}</p>
            </li>
          ))
        )}
      </ul>

      {currentUserId && isOwnPost ? (
        <p className="post-comments-hint">
          You can comment on friends&apos; posts, not your own.
        </p>
      ) : null}

      {currentUserId && !isOwnPost ? (
        <form className="post-comment-form" onSubmit={handleSubmit}>
          <div className="post-comment-input-row">
            <textarea
              ref={inputRef}
              className="post-comment-input"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment…"
              maxLength={2000}
              aria-label="Comment text"
            />
            <div className="post-comment-emoji-wrap" ref={pickerRef}>
              <button
                type="button"
                className="btn btn-secondary post-comment-emoji-toggle"
                onClick={() => setEmojiOpen((o) => !o)}
                aria-expanded={emojiOpen}
                aria-haspopup="listbox"
                aria-label="Open emoji picker"
              >
                😊
              </button>
              {emojiOpen ? (
                <div
                  className="post-comment-emoji-picker"
                  role="listbox"
                  aria-label="Common emojis"
                >
                  {EMOJI_PICKER_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="post-comment-emoji-btn"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <button
            type="submit"
            className="btn btn-primary post-comment-submit"
            disabled={submitting || !text.trim()}
          >
            {submitting ? "Posting…" : "Comment"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
