import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </ErrorBoundary>,
);
