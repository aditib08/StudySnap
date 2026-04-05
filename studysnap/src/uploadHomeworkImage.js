import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase.js";

const MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 90_000;

function withTimeout(promise, ms, onTimeoutMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(onTimeoutMessage)),
      ms
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timer)
  );
}

async function uploadViaFirebaseStorage(uid, file) {
  const rawExt = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const ext = rawExt.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg";
  const path = `posts/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await withTimeout(
    uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    }),
    UPLOAD_TIMEOUT_MS,
    "Firebase upload timed out. Enable Storage in Firebase Console and check security rules."
  );
  return withTimeout(
    getDownloadURL(storageRef),
    30_000,
    "Could not get download URL from Firebase Storage."
  );
}

async function uploadViaCloudinary(uid, file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

  if (!cloudName || !uploadPreset) {
    return null;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  const folder = import.meta.env.VITE_CLOUDINARY_FOLDER?.trim();
  if (folder) {
    formData.append("folder", `${folder}/${uid}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: formData, signal: controller.signal }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        (typeof data?.error === "string" ? data.error : null) ||
        `Upload failed (${res.status}).`;
      throw new Error(msg);
    }
    const url = data?.secure_url;
    if (!url || typeof url !== "string") {
      throw new Error("Upload succeeded but no image URL was returned.");
    }
    return url;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(
        "Cloudinary upload timed out. Check your connection or try again."
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Uploads a homework/assignment image: prefers Cloudinary when configured,
 * otherwise Firebase Storage. Retries with Storage if Cloudinary fails.
 */
export async function uploadHomeworkImage(uid, file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 8 MB or smaller.");
  }

  const hasCloudinary =
    import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim() &&
    import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

  if (hasCloudinary) {
    try {
      return await uploadViaCloudinary(uid, file);
    } catch (cloudErr) {
      try {
        return await uploadViaFirebaseStorage(uid, file);
      } catch {
        throw cloudErr;
      }
    }
  }

  try {
    return await uploadViaFirebaseStorage(uid, file);
  } catch (storageErr) {
    throw new Error(
      storageErr?.message ||
        "Upload failed. Enable Firebase Storage (Console → Build → Storage) or set VITE_CLOUDINARY_UPLOAD_PRESET for Cloudinary."
    );
  }
}
