// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Build-time version stamp ────────────────────────────────────────────────
// We derive a short build id from Vercel / GitHub Actions metadata, falling
// back to a timestamp for local dev. The same value is:
//   - injected into the client bundle as `import.meta.env.VITE_APP_VERSION`
//   - written to `public/version.json` so it ships as a static asset the
//     running app can poll. When the polled value drifts from the baked-in
//     value, an "Update available" prompt appears.
const __dir = dirname(fileURLToPath(import.meta.url));
const BUILD_ID =
  (process.env.VERCEL_GIT_COMMIT_SHA && process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)) ||
  (process.env.GITHUB_SHA && process.env.GITHUB_SHA.slice(0, 12)) ||
  `dev-${Date.now()}`;

try {
  mkdirSync(resolve(__dir, "public"), { recursive: true });
  writeFileSync(
    resolve(__dir, "public", "version.json"),
    JSON.stringify({ version: BUILD_ID, builtAt: new Date().toISOString() }) + "\n",
  );
} catch {
  // If public/ isn't writable for some reason, the build still succeeds; the
  // update prompt will simply never trigger on web until the next deploy.
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
        rollupConfig: {
          external: ["@opentelemetry/api"],
        },
      }),
      // PWA plugin disabled in SSR build (Vercel/Cloudflare) — the SW is served
      // as a static file from public/ or built separately.
      // Enable only for pure client builds (vite build --mode client).
      ...(process.env.VERCEL || process.env.CF_PAGES
        ? []
        : [
            VitePWA({
              strategies: "injectManifest",
              srcDir: "src",
              filename: "sw.ts",
              registerType: "prompt",
              injectRegister: false,
              manifest: false,
              devOptions: { enabled: false },
              injectManifest: {
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
                globIgnores: ["**/stats.html"],
              },
            }),
          ]),
    ],
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(BUILD_ID),
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      cssMinify: true,
      cssCodeSplit: true,
      sourcemap: false,
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/react/')) return 'vendor-react';
            if (id.includes('node_modules/@supabase/supabase-js')) return 'vendor-supabase';
            if (id.includes('node_modules/recharts')) return 'vendor-charts';
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  },
});
