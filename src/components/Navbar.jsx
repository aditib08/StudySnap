import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase.js";

const linkClass = ({ isActive }) =>
  "nav-link" + (isActive ? " nav-link-active" : "");

export default function Navbar() {
  const [user, setUser] = useState(() => auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

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
