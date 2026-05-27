# Implementation Plan: PWA Offline Support

## Overview

This plan implements Progressive Web App capabilities for the EduOS platform using `vite-plugin-pwa` in `injectManifest` mode with Workbox. Tasks are ordered to build incrementally: dependencies → manifest → service worker → registration → state management → UI → integration → verification.

## Tasks

- [x] 1. Install dependencies and configure vite-plugin-pwa
  - [x] 1.1 Install vite-plugin-pwa and workbox dependencies
    - Run `npm install -D vite-plugin-pwa` to add the PWA plugin
    - This provides Workbox integration and the injectManifest build pipeline
    - _Requirements: 2.2, 3.1_

  - [x] 1.2 Add vite-plugin-pwa configuration to vite.config.ts
    - Import `VitePWA` from `vite-plugin-pwa`
    - Add to the `plugins` array with `strategies: "injectManifest"`, `srcDir: "src"`, `filename: "sw.ts"`, `registerType: "prompt"`, `injectRegister: false`, `manifest: false`, `devOptions: { enabled: false }`
    - _Requirements: 2.2, 3.1_

- [x] 2. Create Web App Manifest and icons
  - [x] 2.1 Create manifest.webmanifest in public directory
    - Create `public/manifest.webmanifest` with fields: `name: "EduOS - EliteClass"`, `short_name: "EduOS"`, `description`, `start_url: "/"`, `display: "standalone"`, `theme_color`, `background_color`
    - Include icons array with 192x192, 512x512, and maskable variants
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.2 Add placeholder PWA icons to public directory
    - Create `public/icons/icon-192x192.png` and `public/icons/icon-512x512.png` placeholder icons
    - Create `public/icons/icon-maskable-512x512.png` for maskable purpose
    - _Requirements: 1.2, 1.3_

  - [x] 2.3 Add manifest link tag to the HTML head
    - Add `<link rel="manifest" href="/manifest.webmanifest">` to the application's HTML template
    - Add `<meta name="theme-color">` meta tag matching the manifest theme_color
    - _Requirements: 1.4_

- [x] 3. Write the service worker source
  - [x] 3.1 Create src/sw.ts with precaching and routing strategies
    - Import `precacheAndRoute` from `workbox-precaching` and route/strategy modules from `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`
    - Call `precacheAndRoute(self.__WB_MANIFEST)` for build-injected precache entries
    - Register Cache First route for hashed static assets matching `/assets/*.[hash].(js|css|woff2|png|jpg|svg)`
    - Register Stale While Revalidate route for HTML documents
    - Register Network First route for Supabase API GET requests (`https://*.supabase.co/rest/v1/*`) with 3s network timeout, `ExpirationPlugin` (maxEntries: 100, maxAgeSeconds: 86400), and `CacheableResponsePlugin` (statuses: [0, 200])
    - Use cache names: `eduos-static-v1`, `eduos-documents-v1`, `eduos-api-v1`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.2 Add service worker lifecycle handlers
    - Add `self.skipWaiting()` on message event (when prompted by client)
    - Add `clientsClaim()` in activate event for immediate control
    - Post `SW_UPDATE_AVAILABLE` message to clients when a new SW is waiting
    - Handle old cache cleanup on activate (remove caches not matching current version names)
    - _Requirements: 2.3, 8.1_

  - [ ]* 3.3 Write property tests for URL matching logic
    - **Property 1: Hashed asset URL matching** — Generate random filenames with/without valid content hashes and extensions, verify HASHED_ASSET_PATTERN classifies correctly
    - **Property 2: Supabase API URL matching** — Generate random URLs with/without valid supabase.co domain patterns, verify SUPABASE_API_PATTERN classifies correctly
    - **Validates: Requirements 3.2, 4.1**

- [x] 4. Create service worker registration module
  - [x] 4.1 Create src/lib/sw-register.ts
    - Export `registerSW()` function that checks `typeof window !== 'undefined'` and `import.meta.env.PROD` before registering
    - Register `/sw.js` (the built output) using `navigator.serviceWorker.register()`
    - Listen for `updatefound` event on registration, then `statechange` on installing worker
    - When new SW enters `installed` state with existing controller, invoke `onUpdateAvailable` callback
    - Log and swallow registration errors (graceful degradation)
    - _Requirements: 2.1, 2.3, 2.4_

- [x] 5. Checkpoint - Ensure build configuration is correct
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create Zustand stores for network and install state
  - [x] 6.1 Create src/store/networkStore.ts
    - Define Zustand store with state: `isOnline: boolean`, `lastOnlineAt: number | null`
    - Implement `initialize()` that attaches `online`/`offline` window event listeners and sets initial state from `navigator.onLine`
    - Implement `cleanup()` to remove listeners
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.2 Create src/store/installStore.ts
    - Define Zustand store with state: `canInstall`, `isInstalled`, `isDismissed`, `deferredPrompt`
    - Implement `initialize()` that listens for `beforeinstallprompt` event and `appinstalled` event
    - Implement `triggerInstall()` that calls `deferredPrompt.prompt()` and awaits `userChoice`
    - Implement `dismiss()` that saves dismissal timestamp to localStorage key `eduos-install-dismissed`
    - Implement `shouldShowBanner()` that checks: not installed, not dismissed within 7 days, canInstall is true
    - Wrap localStorage access in try/catch for private browsing compatibility
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 6.3 Write property test for install cooldown logic
    - **Property 6: Install banner 7-day cooldown** — Generate random dismissal timestamps and current timestamps, verify shouldShowBanner returns false within 7 days and true after
    - **Validates: Requirements 6.3**

- [x] 7. Create PWA UI components
  - [x] 7.1 Create src/components/pwa/OfflineIndicator.tsx
    - Read `isOnline` from networkStore
    - Render a non-obstructive banner (e.g., fixed top bar below nav) when offline
    - Show toast via sonner when reconnecting
    - Use accessible ARIA attributes (role="status", aria-live="polite")
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Create src/components/pwa/InstallBanner.tsx
    - Read state from installStore
    - Render only when `shouldShowBanner()` returns true
    - Include install button (triggers `triggerInstall()`) and dismiss button (triggers `dismiss()`)
    - Style with existing Tailwind/shadcn patterns
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 7.3 Create src/components/pwa/UpdatePrompt.tsx
    - Display a toast/banner when SW update is available (callback from sw-register)
    - Include "Update now" button that posts `skipWaiting` message to the waiting SW and reloads page
    - Include dismiss option
    - _Requirements: 2.3_

  - [x] 7.4 Create src/components/pwa/PWAProvider.tsx
    - Create a provider component that initializes on mount: calls `registerSW()`, initializes networkStore, initializes installStore
    - Cleans up stores on unmount
    - Renders `OfflineIndicator`, `InstallBanner`, `UpdatePrompt` as children
    - Passes update callback from sw-register to UpdatePrompt
    - _Requirements: 2.1, 7.1, 6.1_

- [x] 8. Integrate PWAProvider into the app root
  - [x] 8.1 Add PWAProvider to the application's root layout
    - Import `PWAProvider` and render it in the root layout component (wrapping or alongside existing providers)
    - Ensure it only renders on the client (guard with `typeof window !== 'undefined'` or use dynamic import)
    - _Requirements: 1.4, 2.1, 7.1, 6.1_

- [x] 9. Checkpoint - Ensure all components render and app builds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Verify build and service worker generation
  - [x] 10.1 Run production build and verify SW output
    - Run `npm run build` and confirm `sw.js` is generated in the output directory
    - Verify the precache manifest is injected into the built service worker
    - Verify `manifest.webmanifest` is present in the build output
    - _Requirements: 2.2, 3.1_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The placeholder icons (task 2.2) should be replaced with properly designed brand icons before production release
- The service worker only activates in production builds (`devOptions: { enabled: false }`)
- TanStack Query's existing `refetchOnReconnect` behavior complements the SW caching layer

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "3.3", "4.1"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["7.4"] },
    { "id": 7, "tasks": ["8.1"] },
    { "id": 8, "tasks": ["10.1"] }
  ]
}
```
