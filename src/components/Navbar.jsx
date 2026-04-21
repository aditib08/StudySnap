import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth } from "../firebase.js";
import { db } from "../firebase.js";

const linkClass = ({ isActive }) =>
  "nav-link" + (isActive ? " nav-link-active" : "");

export default function Navbar() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [streakCount, setStreakCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setStreakCount(0);
      return;
    }
    const userRef = doc(db, "users", user.uid);
    return onSnapshot(userRef, (snap) => {
      const raw = snap.data()?.streakCount;
      const safe = Number.isFinite(raw) ? raw : 0;
      setStreakCount(Math.max(0, safe));
    });
  }, [user?.uid]);

  const displayLabel =
    user?.displayName?.trim() || user?.email || "Signed in";

  async function handleLogout() {
    await signOut(auth);
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/feed" className="navbar-brand">
          StudySnap
        </NavLink>
        <nav className="navbar-links" aria-label="Main">
          <NavLink to="/feed" className={linkClass}>
            Feed
          </NavLink>
          <NavLink to="/schedule" className={linkClass}>
            Schedule
          </NavLink>
        </nav>
        <div className="navbar-user">
          <span className="navbar-streak" aria-live="polite">
            Streak: {streakCount} {streakCount === 1 ? "day" : "days"}
          </span>
          <span
            className="navbar-user-label"
            title={user?.email ?? ""}
          >
            {displayLabel}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-navbar-logout"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
