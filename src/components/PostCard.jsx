import { useState } from "react";
import { db } from "../firebase.js";
import { setPostVote } from "../postVotes.js";
import PostComments from "./PostComments.jsx";

export default function PostCard({
  post,
  onDelete,
  currentUserId,
  currentUserEmail,
}) {
  const [voteError, setVoteError] = useState(null);
  const [voteBusy, setVoteBusy] = useState(false);

  const upvotes = Array.isArray(post.upvotes) ? post.upvotes : [];
  const downvotes = Array.isArray(post.downvotes) ? post.downvotes : [];
  const upCount = upvotes.length;
  const downCount = downvotes.length;
  /** Author-only label: validated when strictly more upvotes than downvotes */
  const snapValidated = upCount > downCount;

  const isOwnPost = Boolean(currentUserId && post.authorId === currentUserId);
  /** Logged-in viewers see validation: friends can vote; author sees counts + message */
  const showVoteRow = Boolean(currentUserId);

  const votedUp = Boolean(currentUserId && upvotes.includes(currentUserId));
  const votedDown = Boolean(currentUserId && downvotes.includes(currentUserId));

  async function handleVote(direction) {
    if (!currentUserId || isOwnPost) return;
    setVoteError(null);
    setVoteBusy(true);
    try {
      await setPostVote(db, post.id, currentUserId, direction);
    } catch (e) {
      setVoteError(e?.message || "Could not save vote.");
    } finally {
      setVoteBusy(false);
    }
  }

  return (
    <article className="card post-card">
      <header className="post-header">
        <span className="post-author">{post.author}</span>
        {onDelete ? (
          <div className="post-header-meta">
            <button
              type="button"
              className="btn post-remove"
              onClick={onDelete}
            >
              Remove
            </button>
          </div>
        ) : null}
      </header>
      {post.body ? <p className="post-body">{post.body}</p> : null}
      {post.imageUrl ? (
        <a
          href={post.imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="post-image-wrap"
        >
          <img
            src={post.imageUrl}
            alt="Assignment photo in this post"
            className="post-image"
            loading="lazy"
          />
        </a>
      ) : null}

      {showVoteRow ? (
        <div
          className="post-votes"
          role="group"
          aria-label={
            isOwnPost
              ? "Validation counts on your post"
              : "Validate this post"
          }
        >
          {isOwnPost ? (
            <>
              <p
                className={`post-validation-msg${snapValidated ? "" : " post-validation-msg--not"}`}
              >
                {snapValidated ? "Study Snap Validated!" : "Not validated"}
              </p>
              <div className="post-vote-summary" aria-live="polite">
                <span className="post-vote-readonly">
                  <span aria-hidden="true">👍</span>{" "}
                  <span className="post-vote-count">{upCount}</span>
                </span>
                <span className="post-vote-readonly">
                  <span aria-hidden="true">👎</span>{" "}
                  <span className="post-vote-count">{downCount}</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn post-vote-btn${votedUp ? " post-vote-btn--active" : ""}`}
                onClick={() => handleVote("up")}
                disabled={voteBusy}
                aria-pressed={votedUp}
                aria-label={`Thumbs up, ${upCount} votes`}
              >
                <span aria-hidden="true">👍</span>{" "}
                <span className="post-vote-count">{upCount}</span>
              </button>
              <button
                type="button"
                className={`btn post-vote-btn${votedDown ? " post-vote-btn--active" : ""}`}
                onClick={() => handleVote("down")}
                disabled={voteBusy}
                aria-pressed={votedDown}
                aria-label={`Thumbs down, ${downCount} votes`}
              >
                <span aria-hidden="true">👎</span>{" "}
                <span className="post-vote-count">{downCount}</span>
              </button>
              {voteError ? (
                <p className="form-error post-vote-error" role="alert">
                  {voteError}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <PostComments
        postId={post.id}
        postAuthorId={post.authorId}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
      />
    </article>
  );
}
