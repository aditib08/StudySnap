export default function PostCard({ post, onDelete }) {
  return (
    <article className="card post-card">
      <header className="post-header">
        <span className="post-author">{post.author}</span>
        <div className="post-header-meta">
          <time className="post-time" dateTime={post.dateTime || post.time}>
            {post.time}
          </time>
          {onDelete ? (
            <button
              type="button"
              className="btn post-remove"
              onClick={onDelete}
            >
              Remove
            </button>
          ) : null}
        </div>
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
    </article>
  );
}
