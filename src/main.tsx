import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Revision is deliberately changed on cache-recovery releases so clients still
// running an old app shell fetch the newest service-worker script immediately.
const SERVICE_WORKER_REVISION = "20260818-restore-v1";

// Global listener for chunk load failures (common in PWAs after a new Vercel deploy)
window.addEventListener("error", (event) => {
  const msg = String(event.message || "");
  if (
    msg.includes("Loading chunk") ||
    msg.includes("CSS_CHUNK_LOAD_FAILED") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module")
  ) {
    console.warn("Chunk load failure detected, forcing reload...");
    window.location.reload();
  }
}, true);

window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason?.message || event.reason || "");
  if (
    msg.includes("Loading chunk") ||
    msg.includes("CSS_CHUNK_LOAD_FAILED") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module")
  ) {
    console.warn("Unhandled chunk load rejection detected, forcing reload...");
    window.location.reload();
  }
});

// Do this before rendering the app so stale service workers update at the first
// possible moment. The worker itself has no fetch handler, so it cannot cache
// an old HTML shell after this recovery release.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(`/sw.js?rev=${SERVICE_WORKER_REVISION}`, { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </ErrorBoundary>,
);
