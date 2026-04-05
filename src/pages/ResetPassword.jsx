import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase.js";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password should be at least 6 characters.");
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(
        auth,
        trimmedEmail,
        currentPassword
      );
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in.");

      const displayName = username.trim();
      if (displayName) {
        await updateProfile(user, { displayName });
        await setDoc(
          doc(db, "users", user.uid),
          { displayName },
          { merge: true }
        );
      }

      await updatePassword(user, newPassword);

      setSuccess("Your account was updated. Redirecting…");
      setTimeout(() => navigate("/feed", { replace: true }), 800);
    } catch (err) {
      const code = err?.code ?? "";
      const map = {
        "auth/invalid-email": "Enter a valid email address.",
        "auth/invalid-credential":
          "Email or current password is incorrect.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
        "auth/weak-password": "New password should be at least 6 characters.",
      };
      setError(map[code] || err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page login-page">
      <h1 className="page-title">Update account</h1>
      <p className="page-lead">
        Enter your email, current password, and a new username and password. Nothing
        is sent by email.
      </p>

      <form className="card form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>New username</span>
          <input
            type="text"
            autoComplete="nickname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="How you want to appear (optional)"
          />
        </label>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        {success && (
          <p className="add-friend-toast add-friend-success" role="status">
            {success}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Please wait…" : "Save changes"}
        </button>
      </form>

      <p className="page-footer">
        <Link to="/">Back to sign in</Link>
      </p>
    </div>
  );
}
