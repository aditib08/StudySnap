import { normalizeUserEmail } from "./userProfile.js";

/**
 * Only these accounts may open the Admin dashboard (client-side gate; lock down
 * in Firestore rules for production).
 */
export const ADMIN_EMAILS = [
  "rishabhmalkani927@gmail.com",
  "ajitesh.bontagarla16@gmail.com",
  "kulkarni.r.akash@gmail.com",
  "aditiburra@gmail.com",
];

const ADMIN_EMAIL_SET = new Set(
  ADMIN_EMAILS.map((e) => normalizeUserEmail(e))
);

export function isAdminUser(user) {
  if (!user?.email) return false;
  return ADMIN_EMAIL_SET.has(normalizeUserEmail(user.email));
}
