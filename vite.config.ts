// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Avoid TanStack Start's default <StartClient>/<Await> bootstrap. In the
    // current React/TanStack combo it can call React.use before a dispatcher is
    // active on some clients, which blanks the app during hydration.
    client: { entry: "client" },
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    optimizeDeps: {
      // Pre-bundle the router graph up front. Otherwise these are discovered
      // mid-session, Vite re-optimizes, and the page ends up holding two React
      // instances ("dispatcher.useContext of null" / blank screen) — which the
      // preview iframe can't self-heal from when the HMR socket is unavailable.
      include: [
        "@tanstack/react-router",
        "@tanstack/react-store",
        "@tanstack/store",
        "@tanstack/react-query",
      ],
    },
  },
});
