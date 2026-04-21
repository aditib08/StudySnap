import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth } from "../firebase.js";
import { db } from "../firebase.js";
import { isAdminUser } from "../adminConfig.js";

const linkClass = ({ isActive }) =>
  "nav-link" + (isActive ? " nav-link-active" : "");

export default function Navbar() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [streakCount, setStreakCount] = useState(0);
  const [profileDisplayName, setProfileDisplayName] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setStreakCount(0);
      setProfileDisplayName("");
      return;
    }
    const userRef = doc(db, "users", user.uid);
    return onSnapshot(userRef, (snap) => {
      const d = snap.data();
      const raw = d?.streakCount;
      const safe = Number.isFinite(raw) ? raw : 0;
      setStreakCount(Math.max(0, safe));
      setProfileDisplayName((d?.displayName ?? "").trim());
    });
  }, [user?.uid]);

  const displayLabel =
    profileDisplayName ||
    user?.displayName?.trim() ||
    user?.email ||
    "Signed in";

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
          <NavLink to="/profile" className={linkClass}>
            Profile
          </NavLink>
          {isAdminUser(user) ? (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          ) : null}
        </nav>
        <div className="navbar-user">
          <span className="navbar-streak" aria-live="polite">
            <span className="navbar-streak-label">Streak:</span>
            <span className="navbar-streak-emoji" aria-hidden="true">
              🔥
            </span>
            <span>{streakCount}</span>
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
