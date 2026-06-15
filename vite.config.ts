// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

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
