import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase.js";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_ORDER = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function todayAbbr() {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
}

function blockWindowMs(block) {
  const startStr = block.time;
  const endStr = block.endTime ?? block.time;
  const now = new Date();
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    sh,
    sm,
    0,
    0
  );
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    eh,
    em,
    0,
    0
  );
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function isBlockActive(block, nowMs) {
  if (block.day !== todayAbbr()) return false;
  const { startMs, endMs } = blockWindowMs(block);
  return nowMs >= startMs && nowMs < endMs;
}

/** For today's blocks only: upcoming | active | ended */
function getTodayBlockCountdown(block, nowMs) {
  if (block.day !== todayAbbr()) return null;
  const { startMs, endMs } = blockWindowMs(block);
  if (nowMs < startMs) {
    return {
      phase: "upcoming",
      seconds: Math.max(0, Math.floor((startMs - nowMs) / 1000)),
    };
  }
  if (nowMs < endMs) {
    return {
      phase: "active",
      seconds: Math.max(0, Math.floor((endMs - nowMs) / 1000)),
    };
  }
  return { phase: "ended", seconds: 0 };
}

/**
 * Random time for the "snap" notification, always in the last half of the block.
 * e.g. 12:00–13:00 → only between 12:30 and session end (not the first 30 minutes).
 */
function pickRandomSnapMsSecondHalf(startMs, endMs, nowMs) {
  const duration = endMs - startMs;
  if (duration <= 0) {
    return Math.min(nowMs + 300, endMs - 1);
  }
  const halfwayMs = startMs + duration / 2;
  const min = Math.max(nowMs + 1000, halfwayMs);
  const max = endMs - 500;
  if (max <= min) {
    return Math.min(nowMs + 300, endMs - 1);
  }
  return Math.floor(min + Math.random() * (max - min));
}

/** Always HH:MM:SS */
function formatHMS(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const hs = h >= 100 ? String(h) : String(h).padStart(2, "0");
  return `${hs}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Schedule() {
  const navigate = useNavigate();
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const [blocks, setBlocks] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);

  const [day, setDay] = useState(() => todayAbbr());
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [adding, setAdding] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [snapTargets, setSnapTargets] = useState({});
  const [modal, setModal] = useState({
    open: false,
    kind: null,
    blockLabel: "",
  });

  const activeBlocksRef = useRef([]);
  const sortedBlocksRef = useRef([]);
  const snapTargetsRef = useRef({});
  const snapModalShownRef = useRef({});
  const sessionEndShownRef = useRef({});

  snapTargetsRef.current = snapTargets;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setBlocks([]);
      setScheduleLoading(false);
      return;
    }
    setScheduleLoading(true);
    const colRef = collection(db, "users", uid, "scheduleBlocks");
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        setBlocks(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setScheduleLoading(false);
      },
      () => setScheduleLoading(false)
    );
    return () => unsub();
  }, [uid]);

  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => {
      const da = DAY_ORDER[a.day] ?? 99;
      const db = DAY_ORDER[b.day] ?? 99;
      if (da !== db) return da - db;
      return (a.time || "").localeCompare(b.time || "");
    });
  }, [blocks]);

  sortedBlocksRef.current = sortedBlocks;

  const activeBlocks = useMemo(() => {
    return sortedBlocks.filter((b) => isBlockActive(b, nowMs));
  }, [sortedBlocks, nowMs]);

  const activeIdsKey = useMemo(
    () => activeBlocks.map((b) => b.id).sort().join(","),
    [activeBlocks]
  );

  activeBlocksRef.current = activeBlocks;

  useEffect(() => {
    const list = activeBlocksRef.current;
    for (const id of Object.keys(snapModalShownRef.current)) {
      if (!list.some((b) => b.id === id)) delete snapModalShownRef.current[id];
    }
    for (const id of Object.keys(sessionEndShownRef.current)) {
      if (!sortedBlocksRef.current.some((b) => b.id === id)) {
        delete sessionEndShownRef.current[id];
      }
    }
    setSnapTargets((prev) => {
      const activeIds = new Set(list.map((b) => b.id));
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!activeIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      for (const b of list) {
        if (next[b.id] != null) continue;
        const { startMs, endMs } = blockWindowMs(b);
        next[b.id] = pickRandomSnapMsSecondHalf(startMs, endMs, Date.now());
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeIdsKey]);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNowMs(t);

      const actives = activeBlocksRef.current;
      const allBlocks = sortedBlocksRef.current;
      const d = todayAbbr();

      let showedSessionEnd = false;
      for (const b of allBlocks) {
        if (b.day !== d) continue;
        const { endMs } = blockWindowMs(b);
        if (t >= endMs && t - endMs < 2000 && !sessionEndShownRef.current[b.id]) {
          sessionEndShownRef.current[b.id] = true;
          setModal({
            open: true,
            kind: "sessionOver",
            blockLabel: b.label || "Study block",
          });
          showedSessionEnd = true;
          break;
        }
      }

      if (!showedSessionEnd) {
        for (const b of actives) {
          const target = snapTargetsRef.current[b.id];
          if (
            target != null &&
            t >= target &&
            !snapModalShownRef.current[b.id]
          ) {
            snapModalShownRef.current[b.id] = true;
            setModal({
              open: true,
              kind: "snap",
              blockLabel: b.label || "Study block",
            });
            break;
          }
        }
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, []);

  async function handleAddBlock(e) {
    e.preventDefault();
    if (!uid || !label.trim()) return;
    setAdding(true);
    try {
      await addDoc(collection(db, "users", uid, "scheduleBlocks"), {
        day,
        label: label.trim(),
        time,
        endTime,
        createdAt: serverTimestamp(),
      });
      setLabel("");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteBlock(blockId) {
    if (!uid) return;
    await deleteDoc(doc(db, "users", uid, "scheduleBlocks", blockId));
  }

  function closeModal() {
    setModal({ open: false, kind: null, blockLabel: "" });
  }

  function goToFeedForSnap() {
    closeModal();
    navigate("/feed");
  }

  return (
    <div className="page schedule-page">
      <h1 className="page-title">Schedule</h1>
      <p className="page-lead">Plan study blocks for the week.</p>

      {modal.open && (
        <div
          className="schedule-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-title"
        >
          <div className="schedule-modal schedule-modal-prominent">
            <h2 id="schedule-modal-title" className="schedule-modal-title">
              {modal.kind === "sessionOver"
                ? "Session over! Time to post your snap!"
                : "Time to snap!"}
            </h2>
            <p className="schedule-modal-body">
              {modal.kind === "sessionOver"
                ? "This study block has ended. Share a snap from your session on the feed."
                : "Take a moment to post a study snap on the feed."}
              {modal.blockLabel ? (
                <>
                  {" "}
                  <span className="schedule-modal-block">
                    ({modal.blockLabel})
                  </span>
                </>
              ) : null}
            </p>
            <div className="schedule-modal-actions">
              <button
                type="button"
                className="btn btn-primary schedule-modal-primary"
                onClick={goToFeedForSnap}
              >
                Go to Feed
              </button>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {!uid ? (
        <p className="page-lead">Sign in to manage your schedule.</p>
      ) : scheduleLoading ? (
        <p className="page-lead">Loading schedule…</p>
      ) : (
        <>
          <form className="card form-card schedule-form" onSubmit={handleAddBlock}>
            <div className="schedule-row schedule-row-triple">
              <label className="field">
                <span>Day</span>
                <select value={day} onChange={(e) => setDay(e.target.value)}>
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Start</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <label className="field">
                <span>End</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>What are you studying?</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Flashcards, essay draft"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={adding}
            >
              {adding ? "Adding…" : "Add block"}
            </button>
          </form>

          <ul className="schedule-list">
            {sortedBlocks.length === 0 ? (
              <li className="page-lead schedule-list-empty">
                No blocks yet. Add your first study block above.
              </li>
            ) : (
              sortedBlocks.map((b) => {
                const active = isBlockActive(b, nowMs);
                const cd = getTodayBlockCountdown(b, nowMs);
                const showCountdown = cd && (cd.phase === "upcoming" || cd.phase === "active");

                return (
                  <li
                    key={b.id}
                    className={
                      "card schedule-item" +
                      (active ? " schedule-item-active" : "") +
                      (cd?.phase === "upcoming" ? " schedule-item-upcoming" : "")
                    }
                  >
                    <div className="schedule-item-row">
                      <span className="schedule-day">{b.day}</span>
                      <span className="schedule-time">
                        {b.time}–{b.endTime ?? b.time}
                      </span>
                      <span className="schedule-label">{b.label}</span>
                      <button
                        type="button"
                        className="schedule-delete-btn"
                        onClick={() => handleDeleteBlock(b.id)}
                        aria-label={`Delete block: ${b.label}`}
                      >
                        ×
                      </button>
                    </div>
                    {cd && (
                      <div
                        className={
                          "schedule-countdown-banner" +
                          (cd.phase === "ended" ? " schedule-countdown-ended" : "")
                        }
                        aria-live="polite"
                      >
                        {showCountdown ? (
                          <>
                            <span className="schedule-time-remaining-label">
                              {cd.phase === "upcoming"
                                ? "Starts in:"
                                : "Time remaining:"}
                            </span>
                            <span className="schedule-time-remaining-hms">
                              {formatHMS(cd.seconds)}
                            </span>
                          </>
                        ) : (
                          <span className="schedule-countdown-ended-text">
                            Session ended today
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
    </div>
  );
}
