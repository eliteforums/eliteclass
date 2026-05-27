# Implementation Plan: Production Readiness

## Overview

Incremental approach to production-readiness: fix type errors first (unblocks CI), then optimize bundles (quick wins), add edge caching (new module), improve data access (depends on type-safe services), harden auth (depends on KV patterns from caching), and finally tune query/state performance.

## Tasks

- [x] 1. Fix TypeScript compilation errors
  - [x] 1.1 Replace react-hot-toast with sonner
    - Remove `react-hot-toast` from `package.json`
    - Update `src/components/assignments/CreateAssignment.tsx` — replace `toast` import and calls with `sonner`'s `toast`
    - Update any other file importing from `react-hot-toast` (grep codebase)
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Fix Zod schema defaults for form resolvers
    - In exam form schemas: add `.default()` to optional fields so `zodResolver` inferred types align (e.g., `duration`, `totalMarks` fields)
    - In assignment form schemas: fix `CreateAssignment.tsx` resolver type mismatch by aligning Zod schema with form default values
    - In batch form schemas: ensure optional date/time fields use `.default(undefined)` or `.optional()` consistently
    - _Requirements: 1.1, 1.3_

  - [x] 1.3 Add missing types and type exports
    - Add `submission` field to `Assignment` type (or extend interface) in the types file
    - Create or export `AssignmentResource` type to match `AssignmentResourceSchema` (Zod `.infer`)
    - Verify all type exports match their actual definitions across `src/types/` files
    - _Requirements: 1.1, 1.6_

  - [x] 1.4 Add null guards in service functions
    - `src/services/assignment.service.ts` — guard Supabase responses before accessing `.data` properties
    - `src/services/register.service.ts` — guard nullable params and Supabase client initialization
    - Apply the existing `runService` pattern to wrap any unprotected service calls
    - _Requirements: 1.1, 1.4_

  - [x] 1.5 Add explicit type annotations in course services
    - `src/services/course.service.ts` — add return type annotations to exported functions
    - Add parameter type annotations where TypeScript infers `any`
    - Ensure all `async` service functions declare `Promise<ApiResponse<T>>` return types
    - _Requirements: 1.1, 1.5_

  - [x] 1.6 Fix miscellaneous type issues
    - Fix `Blob` vs `boolean` type mismatch in file upload handlers
    - Fix `File` vs `string` type confusion in attachment/resource fields
    - Fix `string` vs enum literal type mismatches (e.g., status fields using string where union type expected)
    - _Requirements: 1.1, 1.5, 1.6_

- [x] 2. Checkpoint — TypeScript clean build
  - Run `tsc --noEmit` and verify zero errors
  - Run `vite build` and verify successful production bundle
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Bundle optimization
  - [x] 3.1 Create lazy route wrappers
    - Create `src/lib/lazy-routes.tsx` with `React.lazy()` wrappers for heavy modules
    - Wrap recharts-dependent components (reports, analytics dashboards)
    - Wrap canvas-dependent components (notebook/canvas editor using fabric/konva)
    - Wrap PDF/Excel generation components (jspdf, exceljs usages)
    - Add `<Suspense>` fallbacks with appropriate loading skeletons
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Update route configuration to use lazy components
    - Replace direct imports with lazy wrappers in route definitions
    - Ensure TanStack Router `loader` functions are unaffected (data loading remains eager)
    - _Requirements: 3.4_

  - [x] 3.3 Add modulepreload hints for critical routes
    - Add `<link rel="modulepreload">` for dashboard and login route chunks in the HTML template or root layout
    - Verify preload hints appear in the SSR-rendered HTML
    - _Requirements: 3.5_

  - [ ]* 3.4 Write unit test for bundle composition
    - Verify `vite build` output does not include recharts/fabric/konva/jspdf/exceljs in the initial entry chunk
    - Parse build manifest or chunk filenames to assert separation
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint — Bundle verified
  - Run `vite build` and inspect output chunk sizes
  - Verify heavy libraries are in separate async chunks
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Edge caching layer
  - [x] 5.1 Implement edge cache module
    - Create `src/lib/edge-cache.ts` with `buildCacheKey`, `edgeCacheGet`, `edgeCachePut`, `edgeCacheInvalidate`
    - Implement tag-based invalidation using Cloudflare `caches.default`
    - Apply `scope: 'user'` to embed user ID in cache keys for user-specific data
    - Apply `scope: 'public'` for institute-level config with 300s TTL
    - Handle Cache API unavailability with try/catch fall-through
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 5.2 Integrate edge cache into service-runner
    - Modify `src/lib/service-runner.ts` (or create a caching wrapper) to check edge cache before Supabase calls
    - Add cache-put after successful Supabase responses for cacheable endpoints
    - Wire invalidation into mutation service calls (create/update/delete)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 5.3 Write property tests for edge cache
    - **Property 1: Cache hit avoids origin** — mock `caches.default`, generate random requests, assert no Supabase call on cache hit
    - **Property 2: Mutation invalidates cache** — generate random mutations, verify matching tags cleared
    - **Property 3: User-scoped cache keys** — generate random user IDs + paths, verify key contains user ID
    - **Property 4: Cache failure fallback** — throw from cache mock, verify Supabase fallback succeeds
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6**

- [x] 6. Scalable data access patterns
  - [x] 6.1 Create paginated query utility
    - Create `src/lib/paginated-query.ts` with `buildPaginatedQuery` and `PaginatedResponse<T>` types
    - Implement cursor-based pagination with configurable page size
    - Add truncation logic: cap results at 1000, set `truncated: true`
    - _Requirements: 4.3, 4.5_

  - [x] 6.2 Implement virtual scrolling data table
    - Create `src/components/ui/VirtualDataTable.tsx` using `@tanstack/react-virtual`
    - Accept generic column definitions and data array
    - Render only visible rows + overscan buffer
    - Support `onLoadMore` callback for infinite scroll integration
    - _Requirements: 4.1, 4.4_

  - [x] 6.3 Convert student/batch list services to server-side filtering
    - Update `src/services/student.service.ts` — add search parameter passed to Supabase `.ilike()` or `.textSearch()`
    - Update `src/services/batch.service.ts` — add filtering and pagination params
    - Ensure no client-side filtering of full datasets remains
    - _Requirements: 4.2, 4.3_

  - [x] 6.4 Wire paginated queries into data table routes
    - Update student list route to use `useInfiniteQuery` with paginated service
    - Update batch list route to use `useInfiniteQuery` with paginated service
    - Connect `VirtualDataTable.onLoadMore` to `fetchNextPage`
    - _Requirements: 4.1, 4.4_

  - [ ]* 6.5 Write property tests for data access
    - **Property 5: Virtual scrolling bounds** — generate random list sizes (101–100000), verify rendered count ≤ viewport formula
    - **Property 6: Server-side filtering** — generate random search strings, verify Supabase query includes filter
    - **Property 7: Pagination parameters** — generate random page sizes + cursors, verify query has correct limit/offset
    - **Property 8: Response truncation** — generate result sets > 1000, verify cap + truncated flag
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5**

- [x] 7. Checkpoint — Data access verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Auth hardening and rate limiting
  - [x] 8.1 Implement rate limiter module
    - Create `src/lib/rate-limiter.ts` with `checkRateLimit` function
    - Use Cloudflare KV atomic counters with TTL-based window expiry
    - Configure: login = 10 attempts / 60s window, register = 5 attempts / 600s window
    - Return `RateLimitResult` with `allowed`, `remaining`, `retryAfterSeconds`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 8.2 Integrate rate limiter into auth endpoints
    - Add rate limit check in login API route (before Supabase auth call)
    - Add rate limit check in register API route (before Supabase auth call)
    - Return HTTP 429 with `Retry-After` header when limit exceeded
    - Fail-open if KV write fails (availability over strictness)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 8.3 Add Supabase client null validation
    - In `src/lib/supabase.ts` or service initialization: validate client is non-null
    - Return structured error via `runService` pattern if client unavailable
    - _Requirements: 5.4_

  - [x] 8.4 Implement auth request serialization
    - Extend existing `currentUserInFlight` pattern in `src/services/auth.service.ts`
    - Create `src/lib/auth-serializer.ts` with `serializeAuthRequest` — per-session promise queue
    - Integrate into auth service calls so concurrent requests from same session execute serially
    - Add 30s timeout to release lock on stuck operations
    - _Requirements: 5.5_

  - [ ]* 8.5 Write property tests for auth hardening
    - **Property 9: Rate limiting enforcement** — generate request sequences with varying counts, verify rejection at threshold
    - **Property 10: Rate limit response format** — verify 429 + Retry-After header on rejected requests
    - **Property 11: Auth serialization** — generate concurrent auth requests, verify no temporal overlap
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5**

- [x] 9. Query and state performance tuning
  - [x] 9.1 Configure TanStack Query stale times
    - Set `staleTime: 300_000` (5 min) for institute-level queries (config, batch list, course list)
    - Set appropriate shorter stale times for user-specific frequently-changing data
    - Ensure `gcTime` is greater than `staleTime` to preserve cache across remounts
    - _Requirements: 6.1, 6.3_

  - [x] 9.2 Add route prefetching
    - In route definitions, add `loader` or `beforeLoad` hooks that call `queryClient.prefetchQuery()` for critical queries
    - Prefetch dashboard data when navigating from login
    - Prefetch relevant batch/student data from sidebar navigation
    - _Requirements: 6.2_

  - [x] 9.3 Enforce single-direction data flow for Zustand stores
    - Audit Zustand stores that duplicate TanStack Query server state
    - Remove redundant Zustand state where TanStack Query already manages it
    - Ensure remaining stores derive from query cache (server → query → store)
    - _Requirements: 6.4_

  - [x] 9.4 Add skeleton UI for dashboard transitions
    - Create skeleton components for dashboard stat cards, tables, and charts
    - Wire into TanStack Query's `isLoading` / `isPending` states
    - Ensure skeleton renders within 100ms of navigation start (no blank screen)
    - _Requirements: 6.5_

  - [ ]* 9.5 Write unit tests for query configuration
    - Verify staleTime values for institute-level queries
    - Verify prefetch calls fire on route transitions
    - Verify skeleton renders before data arrives
    - _Requirements: 6.1, 6.2, 6.5_

- [x] 10. Final checkpoint — Full production readiness
  - Run `tsc --noEmit` — zero errors
  - Run `vite build` — successful, chunks properly split
  - Run full test suite including property tests
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between major phases
- Property tests use `fast-check` with Vitest (minimum 100 iterations per property)
- The ordering ensures each phase builds on a stable foundation from the previous phase
