import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";

const rootEl = document.getElementById("root");

function showFatal(err) {
  const msg = err?.message || String(err);
  const stack = err?.stack ? `\n\n${err.stack}` : "";
  const safe = (msg + stack)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  rootEl.innerHTML = `<div class="fatal-error-screen" style="padding:2rem;font-family:system-ui,sans-serif;background:#0f1419;color:#e8eef5;min-height:100vh;box-sizing:border-box;"><h1 style="font-size:1.25rem;margin:0 0 1rem;">StudySnap couldn’t load</h1><pre style="white-space:pre-wrap;overflow:auto;font-size:0.85rem;color:#f0a8a8;margin:0;">${safe}</pre><p style="color:#8b9cb3;margin-top:1.25rem;font-size:0.9rem;max-width:36rem;line-height:1.5;">If you see a missing <code style="color:#5b9fd4;">VITE_FIREBASE_*</code> message, add a <code style="color:#5b9fd4;">.env</code> file next to <code style="color:#5b9fd4;">package.json</code> (same folder you run <code style="color:#5b9fd4;">npm run dev</code> from) with your Firebase keys. Restart the dev server after editing <code style="color:#5b9fd4;">.env</code>.</p></div>`;
}

async function bootstrap() {
  try {
    const { default: App } = await import("./App.jsx");
    createRoot(rootEl).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>
    );
  } catch (err) {
    console.error(err);
    showFatal(err);
  }
}

bootstrap();
