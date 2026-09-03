import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { hydrateStart } from "@tanstack/react-start/client";
import { RouterProvider } from "@tanstack/react-router";

// Safari (notably iOS) can end up rendering before React's internal dispatcher
// is installed if hydration is kicked off from a microtask while the document
// is still parsing. Wait for a fully parsed document first.
function documentReady(): Promise<void> {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

const RETRY_KEY = "mm-hydration-retry";

// Last-resort recovery so a failed hydration never leaves a blank screen.
// Covers both boot rejections and errors thrown during the hydration render
// (e.g. a stale module graph leaving two React instances on the page).
function recoverOnce(error: unknown) {
  console.error(error);
  try {
    if (sessionStorage.getItem(RETRY_KEY)) return;
    sessionStorage.setItem(RETRY_KEY, "1");
  } catch {
    return;
  }
  window.location.reload();
}

async function boot() {
  const [router] = await Promise.all([hydrateStart(), documentReady()]);

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
      { onUncaughtError: recoverOnce },
    );
  });
}

void boot().catch(recoverOnce);
