# Design Document: Production Readiness

## Overview

This design addresses six areas to make the EliteClass EduOS platform production-ready for 50,000 concurrent users: fixing TypeScript compilation errors, implementing edge caching on Cloudflare Workers, optimizing the JavaScript bundle, enabling scalable data access patterns, hardening auth endpoints, and tuning query/state performance.

The platform runs TanStack Start with SSR on Cloudflare Workers (stateless isolates — no persistent memory), backed by Supabase. The design respects these constraints and builds on existing patterns (`service-runner.ts`, `safe-fetch.ts`, `supabase.ts`).

## Architecture

```mermaid
graph TD
    subgraph "Cloudflare Edge"
        CF[Cloudflare CDN] --> WK[Worker Isolate]
        WK --> CA[Cache API - caches.default]
        WK --> RL[Rate Limiter - KV Counter]
    end

    subgraph "Client Browser"
        APP[React SPA] --> TQ[TanStack Query]
        TQ --> VR[@tanstack/react-virtual]
        APP --> ZS[Zustand Stores]
    end

    subgraph "Origin"
        SB[Supabase Postgres]
        SA[Supabase Auth]
        SS[Supabase Storage]
    end

    WK -->|cache miss| SB
    WK -->|auth| SA
    APP -->|SSR + API| CF
```

**Key architectural decisions:**

1. **Edge caching via Cloudflare Cache API** — `caches.default` stores Supabase responses keyed by URL + user context. No KV needed for read caching.
2. **Rate limiting via Cloudflare KV** — Atomic counters per IP with TTL-based expiry. Lightweight, no external service.
3. **Bundle optimization via React.lazy()** — Heavy libraries (recharts, fabric, konva, jspdf, exceljs) loaded only when their routes activate.
4. **Virtual scrolling via @tanstack/react-virtual** — Already in the TanStack ecosystem, zero new paradigms.
5. **Auth serialization** — Extend existing `currentUserInFlight` promise-dedup pattern in auth.service.ts.

## Components and Interfaces

### 1. Edge Cache Layer (`src/lib/edge-cache.ts`)

```typescript
interface EdgeCacheOptions {
  ttlSeconds: number;
  scope: 'public' | 'user';
  tags?: string[];
}

interface CacheResult<T> {
  data: T;
  hit: boolean;
}

function buildCacheKey(url: string, userId?: string): string;
async function edgeCacheGet<T>(request: Request, options: EdgeCacheOptions): Promise<CacheResult<T> | null>;
async function edgeCachePut<T>(request: Request, data: T, options: EdgeCacheOptions): Promise<void>;
async function edgeCacheInvalidate(tags: string[]): Promise<void>;
```

### 2. Rate Limiter (`src/lib/rate-limiter.ts`)

```typescript
interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number | null;
}

async function checkRateLimit(
  ip: string,
  action: 'login' | 'register',
  config: RateLimitConfig,
  kv: KVNamespace
): Promise<RateLimitResult>;
```

### 3. Virtual Data Table (`src/components/ui/VirtualDataTable.tsx`)

```typescript
interface VirtualDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  rowHeight: number;
  overscan?: number;
  onLoadMore?: () => void;
  hasNextPage?: boolean;
  isLoading?: boolean;
}
```

### 4. Paginated Service Pattern (`src/lib/paginated-query.ts`)

```typescript
interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  totalCount: number;
  truncated: boolean;
}

interface PaginationParams {
  cursor?: string;
  pageSize: number;
  maxResults?: number; // defaults to 1000
}

function buildPaginatedQuery<T>(
  table: string,
  params: PaginationParams,
  filters?: Record<string, unknown>
): SupabaseQuery<T>;
```

### 5. Auth Serializer (`src/lib/auth-serializer.ts`)

```typescript
// Extends existing currentUserInFlight pattern
function serializeAuthRequest<T>(
  sessionId: string,
  operation: () => Promise<T>
): Promise<T>;
```

### 6. Lazy Route Wrappers (`src/lib/lazy-routes.tsx`)

```typescript
// React.lazy wrappers with Suspense fallbacks
const LazyExamModule = React.lazy(() => import('@/modules/exams'));
const LazyNotebookModule = React.lazy(() => import('@/modules/notebook'));
const LazyReportsModule = React.lazy(() => import('@/modules/reports'));
```

## Data Models

### Cache Key Structure

```
Pattern: eliteclass:{scope}:{entity}:{identifier}
Examples:
  eliteclass:public:institute:config:{institute_id}
  eliteclass:user:{user_id}:dashboard:stats
  eliteclass:public:batch:list:{institute_id}
```

### Rate Limit KV Schema

```
Key:    ratelimit:{action}:{ip_hash}
Value:  { count: number, windowStart: number }
TTL:    Matches the window duration (60s for login, 600s for register)
```

### Paginated Response Envelope

```typescript
interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;  // null = last page
  totalCount: number;         // total matching records
  truncated: boolean;         // true if totalCount > maxResults
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Cache hit avoids origin

*For any* cacheable read request where the edge cache contains unexpired data for that request's cache key, the Cache_Layer SHALL return the cached data without making any call to Supabase.

**Validates: Requirements 2.1, 2.2**

### Property 2: Mutation invalidates cache

*For any* mutation operation (create, update, or delete) on a cached entity, the Cache_Layer SHALL remove all cache entries whose tags match the mutated entity, such that a subsequent read for that entity results in a cache miss.

**Validates: Requirements 2.3**

### Property 3: User-scoped cache keys

*For any* user-specific data request with an authenticated user ID, the generated cache key SHALL contain that user ID, ensuring no two distinct users share cache entries for user-scoped data.

**Validates: Requirements 2.5**

### Property 4: Cache failure graceful fallback

*For any* read request where the Cloudflare Cache API throws an error or is unavailable, the Cache_Layer SHALL fall through to Supabase and return the correct data without surfacing the cache error to the client.

**Validates: Requirements 2.6**

### Property 5: Virtual scrolling bounds rendered elements

*For any* data list with more than 100 items, the Data_Table SHALL render no more than `viewportHeight / rowHeight + 2 * overscan` DOM elements, regardless of total list size.

**Validates: Requirements 4.1**

### Property 6: Server-side filtering

*For any* search query string, the Service_Layer SHALL include that string as a server-side filter parameter in the Supabase query, never performing client-side filtering on the full dataset.

**Validates: Requirements 4.2**

### Property 7: Pagination parameters

*For any* paginated data request with a given page size and optional cursor, the Service_Layer SHALL construct a query with a `limit` equal to page size and a `range` or cursor offset matching the requested page position.

**Validates: Requirements 4.3**

### Property 8: Response truncation

*For any* query whose unfiltered result set exceeds 1000 records, the Service_Layer SHALL return at most 1000 records and set `truncated: true` in the response envelope.

**Validates: Requirements 4.5**

### Property 9: Rate limiting enforcement

*For any* sequence of N requests from the same IP within the configured time window, where N exceeds the configured maximum (10 for login, 5 for registration), the Auth_Guard SHALL reject the (N+1)th request.

**Validates: Requirements 5.1, 5.2**

### Property 10: Rate limit response format

*For any* rejected rate-limited request, the Auth_Guard SHALL respond with HTTP status 429 and include a `Retry-After` header whose value is a positive integer representing seconds until the window resets.

**Validates: Requirements 5.3**

### Property 11: Auth request serialization

*For any* set of concurrent auth requests from the same session, the Auth_Guard SHALL execute them serially such that no two auth operations for the same session overlap in execution time.

**Validates: Requirements 5.5**

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Cache API unavailable | Log warning, fall through to Supabase (Property 4) |
| Supabase client is null | Return `{ data: null, error: "Service not configured", success: false }` via `runService` |
| Rate limit KV write fails | Allow the request (fail-open for availability) |
| Dynamic import fails | Show error boundary with retry button, log to console |
| Virtual scroll data fetch fails | Show inline error state with retry, preserve scroll position |
| Pagination cursor invalid | Reset to first page, log warning |
| Auth serialization timeout | Release lock after 30s, allow next request |

**Error propagation pattern** (unchanged from existing):
1. Service functions return `ApiResponse<T>` — never throw
2. `runService()` wraps all service calls with try/catch
3. Components check `response.success` before accessing `response.data`
4. Toast notifications via `sonner` (replacing `react-hot-toast` references)

## Testing Strategy

### Unit Tests (Example-Based)

- TypeScript compilation: single `tsc --noEmit` run (smoke test)
- Bundle analysis: verify heavy libraries absent from initial chunks
- Specific cache TTL values (institute config ≥ 300s)
- Route prefetch configuration
- Skeleton UI render timing

### Property-Based Tests

**Library:** [fast-check](https://github.com/dubzzz/fast-check) (TypeScript-native, integrates with Vitest)

**Configuration:** Minimum 100 iterations per property, configurable via `numRuns`.

Each property test maps to a design property:

| Property | Test Strategy |
|----------|---------------|
| 1: Cache hit avoids origin | Generate random URLs + cached states, mock `caches.default`, assert no Supabase call on hit |
| 2: Mutation invalidates cache | Generate random entity mutations, verify matching cache tags cleared |
| 3: User-scoped cache keys | Generate random user IDs + request paths, verify key contains user ID |
| 4: Cache failure fallback | Generate random requests, throw from cache mock, verify Supabase called successfully |
| 5: Virtual scroll bounds | Generate random list sizes (101–100000), verify rendered count ≤ viewport formula |
| 6: Server-side filtering | Generate random search strings, verify Supabase query includes filter |
| 7: Pagination parameters | Generate random page sizes + cursors, verify query includes limit + offset |
| 8: Response truncation | Generate result sets > 1000, verify response capped + truncated flag |
| 9: Rate limiting | Generate request sequences with varying counts/timing, verify rejection threshold |
| 10: Rate limit response | Generate rejected requests, verify 429 + Retry-After header |
| 11: Auth serialization | Generate concurrent auth requests, verify serial execution (no overlap) |

### Integration Tests

- Full build succeeds (`vite build` exit code 0)
- Route navigation loads lazy chunks correctly
- TanStack Query caching behavior (mount/unmount/remount)
- Supabase query with pagination returns correct pages

### Test Tag Format

```typescript
// Feature: production-readiness, Property 1: Cache hit avoids origin
```
