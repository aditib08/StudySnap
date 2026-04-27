import { useState, useEffect, useMemo, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../firebase.js";
import { isAdminUser } from "../adminConfig.js";

const DETAIL_KEYS = {
  totalPosts: "totalPosts",
  approvedSnaps: "approvedSnaps",
  registeredUsers: "registeredUsers",
  avgLoginsPerDay: "avgLoginsPerDay",
  avgComments: "avgComments",
  thumbsUp: "thumbsUp",
  thumbsDown: "thumbsDown",
  friendLinks: "friendLinks",
  highestStreak: "highestStreak",
  avgStreak: "avgStreak",
};

const DETAIL_TITLES = {
  [DETAIL_KEYS.totalPosts]: "All snaps",
  [DETAIL_KEYS.approvedSnaps]: "Approved snaps",
  [DETAIL_KEYS.registeredUsers]: "Registered users",
  [DETAIL_KEYS.avgLoginsPerDay]: "Logins per day by user",
  [DETAIL_KEYS.avgComments]: "Comments per post",
  [DETAIL_KEYS.thumbsUp]: "Thumbs up — per post",
  [DETAIL_KEYS.thumbsDown]: "Thumbs down — per post",
  [DETAIL_KEYS.friendLinks]: "Friend counts per user",
  [DETAIL_KEYS.highestStreak]: "Streak leaderboard",
  [DETAIL_KEYS.avgStreak]: "Streak value per profile",
};

export default function Admin() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  /** @type {{ posts: object[], users: object[] } | null} */
  const [rawData, setRawData] = useState(null);
  const [detailKey, setDetailKey] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!detailKey) return;
    function onKey(e) {
      if (e.key === "Escape") setDetailKey(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailKey]);

  useEffect(() => {
    if (!authReady || !isAdminUser(user)) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [postsSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "posts")),
          getDocs(collection(db, "users")),
        ]);

        if (cancelled) return;

        const posts = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        let totalUpvotes = 0;
        let totalDownvotes = 0;
        let approvedSnapsCount = 0;
        const commentsByPostId = new Map();

        for (const p of posts) {
          const ups = Array.isArray(p.upvotes) ? p.upvotes.length : 0;
          const downs = Array.isArray(p.downvotes) ? p.downvotes.length : 0;
          totalUpvotes += ups;
          totalDownvotes += downs;
          if (ups > downs) approvedSnapsCount += 1;
        }

        await Promise.all(
          posts.map(async (p) => {
            try {
              const commentsSnap = await getDocs(
                collection(db, "posts", p.id, "comments")
              );
              commentsByPostId.set(p.id, commentsSnap.size);
            } catch {
              commentsByPostId.set(p.id, 0);
            }
          })
        );
        const postsWithCommentCount = posts.map((p) => ({
          ...p,
          commentCount: commentsByPostId.get(p.id) ?? 0,
        }));
        let totalComments = 0;
        commentsByPostId.forEach((count) => {
          totalComments += count;
        });

        let totalFriendEdges = 0;
        let streakSum = 0;
        let streakMax = 0;
        let totalLogins = 0;
        usersSnap.forEach((docu) => {
          const d = docu.data();
          const f = d?.friends;
          if (Array.isArray(f)) totalFriendEdges += f.length;
          const s = d?.streakCount;
          if (Number.isFinite(s)) {
            streakSum += s;
            if (s > streakMax) streakMax = s;
          }
          const loginCount = Number.isFinite(d?.loginCount)
            ? Math.max(0, d.loginCount)
            : 1;
          totalLogins += loginCount;
        });

        if (cancelled) return;

        setRawData({ posts: postsWithCommentCount, users });
        setStats({
          totalPosts: postsWithCommentCount.length,
          approvedSnapsCount,
          totalRegisteredUsers: usersSnap.size,
          avgCommentsPerPost:
            postsWithCommentCount.length > 0
              ? totalComments / postsWithCommentCount.length
              : 0,
          totalUpvotes,
          totalDownvotes,
          acceptedFriendshipsApprox: Math.floor(totalFriendEdges / 2),
          avgLoginsPerDay:
            usersSnap.size > 0 ? Math.max(1, totalLogins / usersSnap.size) : 1,
          avgStreakAmongUsers:
            usersSnap.size > 0 ? streakSum / usersSnap.size : 0,
          maxStreakSeen: streakMax,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const userLabelById = useMemo(() => {
    const m = new Map();
    if (!rawData?.users) return m;
    for (const u of rawData.users) {
      const name = (u.displayName ?? "").trim();
      const em = (u.email ?? "").trim();
      m.set(u.id, name || em || `${u.id.slice(0, 8)}…`);
    }
    return m;
  }, [rawData]);

  const detailRows = useMemo(() => {
    if (!rawData || !detailKey) return null;
    const { posts, users } = rawData;

    switch (detailKey) {
      case DETAIL_KEYS.totalPosts:
        return [...posts]
          .sort((a, b) => {
            const ta = a.createdAt?.toDate?.()?.getTime() ?? 0;
            const tb = b.createdAt?.toDate?.()?.getTime() ?? 0;
            return tb - ta;
          })
          .map((p) => ({
            id: p.id,
            author:
              userLabelById.get(p.authorId) ||
              (p.authorLabel ?? "").trim() ||
              p.authorId ||
              "—",
            preview: ((p.body ?? "") + "").slice(0, 120),
            photo: Boolean(
              typeof p.imageUrl === "string" && p.imageUrl.trim()
            ),
            up: Array.isArray(p.upvotes) ? p.upvotes.length : 0,
            down: Array.isArray(p.downvotes) ? p.downvotes.length : 0,
          }));
      case DETAIL_KEYS.approvedSnaps:
        return posts
          .filter((p) => {
            const up = Array.isArray(p.upvotes) ? p.upvotes.length : 0;
            const down = Array.isArray(p.downvotes) ? p.downvotes.length : 0;
            return up > down;
          })
          .map((p) => ({
            id: p.id,
            author:
              userLabelById.get(p.authorId) ||
              (p.authorLabel ?? "").trim() ||
              p.authorId ||
              "—",
            preview: ((p.body ?? "") + "").slice(0, 120),
            up: Array.isArray(p.upvotes) ? p.upvotes.length : 0,
            down: Array.isArray(p.downvotes) ? p.downvotes.length : 0,
          }));
      case DETAIL_KEYS.avgComments:
        return posts
          .map((p) => ({
            id: p.id,
            author:
              userLabelById.get(p.authorId) ||
              (p.authorLabel ?? "").trim() ||
              p.authorId ||
              "—",
            preview: ((p.body ?? "") + "").slice(0, 120),
            commentCount: Number.isFinite(p.commentCount) ? p.commentCount : 0,
          }))
          .sort((a, b) => b.commentCount - a.commentCount);
      case DETAIL_KEYS.registeredUsers:
        return users
          .map((u) => ({
            id: u.id,
            email: (u.email ?? "").trim() || "—",
            name: (u.displayName ?? "").trim() || "—",
            friends: Array.isArray(u.friends) ? u.friends.length : 0,
            streak: Number.isFinite(u.streakCount) ? u.streakCount : "—",
          }))
          .sort((a, b) => a.email.localeCompare(b.email));
      case DETAIL_KEYS.avgLoginsPerDay: {
        return users
          .map((u) => {
            const logins = Number.isFinite(u?.loginCount)
              ? Math.max(0, u.loginCount)
              : 1;
            return {
              id: u.id,
              label:
                (u.displayName ?? "").trim() ||
                (u.email ?? "").trim() ||
                u.id.slice(0, 8),
              email: (u.email ?? "").trim() || "—",
              loginCount: logins,
            };
          })
          .sort((a, b) => b.loginCount - a.loginCount);
      }
      case DETAIL_KEYS.thumbsUp:
        return posts
          .map((p) => ({
            id: p.id,
            author:
              userLabelById.get(p.authorId) ||
              (p.authorLabel ?? "").trim() ||
              "—",
            up: Array.isArray(p.upvotes) ? p.upvotes.length : 0,
            down: Array.isArray(p.downvotes) ? p.downvotes.length : 0,
          }))
          .sort((a, b) => b.up - a.up);
      case DETAIL_KEYS.thumbsDown:
        return posts
          .map((p) => ({
            id: p.id,
            author:
              userLabelById.get(p.authorId) ||
              (p.authorLabel ?? "").trim() ||
              "—",
            up: Array.isArray(p.upvotes) ? p.upvotes.length : 0,
            down: Array.isArray(p.downvotes) ? p.downvotes.length : 0,
          }))
          .sort((a, b) => b.down - a.down);
      case DETAIL_KEYS.friendLinks:
        return users
          .map((u) => ({
            id: u.id,
            label:
              (u.displayName ?? "").trim() ||
              (u.email ?? "").trim() ||
              u.id.slice(0, 8),
            email: (u.email ?? "").trim() || "—",
            friendCount: Array.isArray(u.friends) ? u.friends.length : 0,
          }))
          .sort((a, b) => b.friendCount - a.friendCount);
      case DETAIL_KEYS.highestStreak:
        return users
          .map((u) => ({
            id: u.id,
            label:
              (u.displayName ?? "").trim() ||
              (u.email ?? "").trim() ||
              u.id.slice(0, 8),
            email: (u.email ?? "").trim() || "—",
            streak: Number.isFinite(u.streakCount) ? u.streakCount : 0,
          }))
          .sort((a, b) => b.streak - a.streak);
      case DETAIL_KEYS.avgStreak:
        return users
          .map((u) => ({
            id: u.id,
            label:
              (u.displayName ?? "").trim() ||
              (u.email ?? "").trim() ||
              u.id.slice(0, 8),
            email: (u.email ?? "").trim() || "—",
            streak: Number.isFinite(u.streakCount) ? u.streakCount : 0,
          }))
          .sort((a, b) => b.streak - a.streak);
      default:
        return [];
    }
  }, [rawData, detailKey, userLabelById]);

  const closeDetail = useCallback(() => setDetailKey(null), []);

  if (!authReady) {
    return (
      <div className="page admin-page">
        <p className="page-lead">Loading…</p>
      </div>
    );
  }

  if (!isAdminUser(user)) {
    return <Navigate to="/feed" replace />;
  }

  function StatCard({ detail, label, value, note }) {
    return (
      <button
        type="button"
        className="card admin-stat-card admin-stat-card--clickable"
        onClick={() => setDetailKey(detail)}
        disabled={!rawData}
        aria-label={`${label}: ${value}. View details.`}
      >
        <h2 className="admin-stat-label">{label}</h2>
        <p className="admin-stat-value">{value}</p>
        {note ? <p className="admin-stat-note">{note}</p> : null}
        <span className="admin-stat-hint">Click for details</span>
      </button>
    );
  }

  return (
    <div className="page admin-page">
      <h1 className="page-title">Admin</h1>
      <p className="page-lead admin-lead">
        Overview of StudySnap usage (aggregated from Firestore). Client-only
        access for <strong>{user?.email}</strong>; secure sensitive data with
        Firestore rules in production.
      </p>

      {loading ? (
        <p className="page-lead">Loading analytics…</p>
      ) : error ? (
        <div className="card admin-error-card">
          <p className="form-error admin-error-title">Could not load admin data</p>
          <pre className="admin-error-pre">{error}</pre>
          <p className="page-lead admin-error-hint">
            If you see “permission denied”, update Firestore security rules so
            your admin account can read <code>posts</code> and <code>users</code>
            (or use a Cloud Function for
            server-side aggregation).
          </p>
        </div>
      ) : stats ? (
        <>
          <section className="admin-stat-grid" aria-label="Summary statistics">
            <StatCard
              detail={DETAIL_KEYS.totalPosts}
              label="Total snaps posted"
              value={stats.totalPosts}
            />
            <StatCard
              detail={DETAIL_KEYS.registeredUsers}
              label="Registered users"
              value={stats.totalRegisteredUsers}
            />
            <StatCard
              detail={DETAIL_KEYS.avgLoginsPerDay}
              label="Avg logins/day"
              value={stats.avgLoginsPerDay.toFixed(2)}
            />
            <StatCard
              detail={DETAIL_KEYS.thumbsUp}
              label="Total thumbs up"
              value={stats.totalUpvotes}
            />
            <StatCard
              detail={DETAIL_KEYS.thumbsDown}
              label="Total thumbs down"
              value={stats.totalDownvotes}
            />
            <StatCard
              detail={DETAIL_KEYS.avgComments}
              label="Average comment number"
              value={stats.avgCommentsPerPost.toFixed(2)}
            />
            <StatCard
              detail={DETAIL_KEYS.approvedSnaps}
              label="Approved snaps"
              value={stats.approvedSnapsCount}
            />
            <StatCard
              detail={DETAIL_KEYS.friendLinks}
              label="Friend links"
              value={stats.acceptedFriendshipsApprox}
              note={
                <>
                  Half of sum of all <code>friends</code> array lengths
                </>
              }
            />
            <StatCard
              detail={DETAIL_KEYS.highestStreak}
              label="Highest streak"
              value={stats.maxStreakSeen}
            />
            <StatCard
              detail={DETAIL_KEYS.avgStreak}
              label="Avg streak (all profiles)"
              value={stats.avgStreakAmongUsers.toFixed(1)}
            />
          </section>
        </>
      ) : null}

      {detailKey && detailRows ? (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-detail-title"
          onClick={closeDetail}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h2 id="admin-detail-title" className="admin-modal-title">
                {DETAIL_TITLES[detailKey] ?? "Details"}
              </h2>
              <button
                type="button"
                className="btn btn-secondary admin-modal-close"
                onClick={closeDetail}
              >
                Close
              </button>
            </div>
            <div className="admin-modal-body">
              <p className="admin-modal-count">
                {detailRows.length} row{detailRows.length === 1 ? "" : "s"}
              </p>
              <div className="admin-table-wrap admin-modal-table-wrap">
                <AdminDetailTable detailKey={detailKey} rows={detailRows} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminDetailTable({ detailKey, rows }) {
  if (!rows.length) {
    return (
      <p className="admin-table-empty">No rows for this metric.</p>
    );
  }

  if (detailKey === DETAIL_KEYS.totalPosts) {
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Post ID</th>
            <th>Author</th>
            <th>Preview</th>
            <th>Photo</th>
            <th>👍</th>
            <th>👎</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="admin-table-mono">{r.id.slice(0, 12)}…</td>
              <td>{r.author}</td>
              <td>{r.preview || "—"}</td>
              <td>{r.photo ? "Yes" : "No"}</td>
              <td>{r.up}</td>
              <td>{r.down}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (detailKey === DETAIL_KEYS.approvedSnaps) {
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Post ID</th>
            <th>Author</th>
            <th>Preview</th>
            <th>👍</th>
            <th>👎</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="admin-table-mono">{r.id.slice(0, 12)}…</td>
              <td>{r.author}</td>
              <td>{r.preview || "—"}</td>
              <td>{r.up}</td>
              <td>{r.down}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (detailKey === DETAIL_KEYS.registeredUsers) {
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>UID</th>
            <th>Email</th>
            <th>Display name</th>
            <th>Friends</th>
            <th>Streak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="admin-table-mono">{r.id.slice(0, 12)}…</td>
              <td>{r.email}</td>
              <td>{r.name}</td>
              <td>{r.friends}</td>
              <td>{r.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (detailKey === DETAIL_KEYS.avgComments) {
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Post ID</th>
            <th>Author</th>
            <th>Preview</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="admin-table-mono">{r.id.slice(0, 12)}…</td>
              <td>{r.author}</td>
              <td>{r.preview || "—"}</td>
              <td>{r.commentCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (detailKey === DETAIL_KEYS.avgLoginsPerDay) {
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>#</th>
            <th>User</th>
            <th>Email</th>
            <th>Total logins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td>{r.label}</td>
              <td className="admin-table-mono">{r.email}</td>
              <td>{r.loginCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (detailKey === DETAIL_KEYS.thumbsUp || detailKey === DETAIL_KEYS.thumbsDown) {
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Post ID</th>
            <th>Author</th>
            <th>👍</th>
            <th>👎</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="admin-table-mono">{r.id.slice(0, 12)}…</td>
              <td>{r.author}</td>
              <td>{r.up}</td>
              <td>{r.down}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (
    detailKey === DETAIL_KEYS.friendLinks ||
    detailKey === DETAIL_KEYS.highestStreak ||
    detailKey === DETAIL_KEYS.avgStreak
  ) {
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>#</th>
            <th>User</th>
            <th>Email</th>
            {detailKey === DETAIL_KEYS.friendLinks ? (
              <th>Friends (count)</th>
            ) : (
              <th>Streak (days)</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td>{r.label}</td>
              <td className="admin-table-mono">{r.email}</td>
              <td>
                {detailKey === DETAIL_KEYS.friendLinks
                  ? r.friendCount
                  : r.streak}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}
