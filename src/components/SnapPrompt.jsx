import { useState, useEffect, useRef } from "react";

export default function SnapPrompt({ onSubmit }) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !imageFile) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit?.({ text: trimmed, imageFile });
      setText("");
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      const msg =
        err?.message ||
        err?.code ||
        (typeof err === "string" ? err : null) ||
        "Could not post. Try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function clearImage() {
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form className="card snap-prompt" onSubmit={handleSubmit}>
      <label className="field">
        <span className="snap-label">Post an assignment update</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe what you’re working on (optional if you add a photo). Friends will see this on their feed."
        />
      </label>

      <div className="snap-photo-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="snap-file-input"
          id="snap-homework-photo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setImageFile(f ?? null);
          }}
        />
        <label htmlFor="snap-homework-photo" className="btn btn-secondary snap-photo-btn">
          Add assignment photo
        </label>
        {imageFile && (
          <button
            type="button"
            className="btn btn-ghost snap-photo-clear"
            onClick={clearImage}
          >
            Remove photo
          </button>
        )}
      </div>

      {previewUrl && (
        <div className="snap-preview">
          <img src={previewUrl} alt="" className="snap-preview-img" />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting || (!text.trim() && !imageFile)}
      >
        {submitting ? "Posting…" : "Post"}
      </button>
    </form>
  );
}
