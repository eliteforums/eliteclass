# Requirements Document

## Introduction

Production-readiness spec for the EduOS education platform (EliteClass). The platform runs TanStack Start with SSR on Cloudflare Workers, backed by Supabase (auth, database, storage, edge functions). The goal is to eliminate all TypeScript compilation errors, harden the codebase for 50,000 concurrent users, and improve runtime performance through proper caching, lazy loading, and scalable data access patterns.

## Glossary

- **Platform**: The EliteClass EduOS web application (TanStack Start SSR on Cloudflare Workers)
- **Build_System**: The Vite 7.3 + TypeScript 5.8 compilation pipeline producing the deployable bundle
- **Type_Checker**: The TypeScript compiler performing static type analysis across the codebase
- **Service_Layer**: The collection of `*.service.ts` files that interact with Supabase for data operations
- **Cache_Layer**: The caching infrastructure responsible for reducing redundant API calls and database queries
- **Bundle_Optimizer**: The Vite code-splitting and dynamic import system that controls initial and lazy-loaded chunks
- **Query_Layer**: TanStack Query configuration managing server state, deduplication, and stale-time policies
- **Auth_Guard**: The authentication and rate-limiting middleware protecting auth endpoints
- **Data_Table**: UI components rendering paginated or virtualized lists of entities (students, batches, etc.)
- **Worker_Instance**: A single Cloudflare Worker invocation handling one or more HTTP requests

## Requirements

### Requirement 1: TypeScript Compilation

**User Story:** As a developer, I want the codebase to compile without errors, so that I can deploy confidently and catch regressions at build time.

#### Acceptance Criteria

1. WHEN the Build_System runs `tsc --noEmit`, THE Type_Checker SHALL produce zero errors across all source files
2. WHEN a dependency is imported in source code, THE Build_System SHALL have that dependency listed in package.json
3. WHEN a Zod schema defines optional fields, THE Type_Checker SHALL ensure form resolver types align with the schema's inferred type without manual casting
4. WHEN a service function receives a parameter from Supabase, THE Service_Layer SHALL narrow null or undefined values before use
5. WHEN a function parameter lacks an explicit type, THE Type_Checker SHALL enforce explicit type annotations (no implicit `any`)
6. WHEN a type is exported from a module, THE Type_Checker SHALL verify the exported name matches the actual type definition

### Requirement 2: Edge Caching Strategy

**User Story:** As a platform operator, I want API responses and static assets cached at the edge, so that the system can serve 50,000 concurrent users without overwhelming the origin database.

#### Acceptance Criteria

1. WHEN a Worker_Instance handles a read request for cacheable data, THE Cache_Layer SHALL check Cloudflare Cache API before forwarding to Supabase
2. WHEN cached data exists and has not expired, THE Cache_Layer SHALL return the cached response without a Supabase round-trip
3. WHEN data is mutated (create, update, delete), THE Cache_Layer SHALL invalidate the relevant cache entries within the same Worker_Instance request
4. WHEN institute-level configuration is requested, THE Cache_Layer SHALL apply a stale-time of at least 300 seconds
5. WHEN user-specific data is requested, THE Cache_Layer SHALL scope the cache key to the authenticated user ID
6. IF the Cloudflare Cache API is unavailable, THEN THE Cache_Layer SHALL fall through to Supabase without error

### Requirement 3: Bundle Optimization

**User Story:** As a student on a mobile device, I want the application to load quickly, so that I can access my courses without waiting on large JavaScript downloads.

#### Acceptance Criteria

1. WHEN the Platform loads the initial route, THE Bundle_Optimizer SHALL exclude charting libraries (recharts) from the main bundle
2. WHEN the Platform loads the initial route, THE Bundle_Optimizer SHALL exclude canvas libraries (fabric, konva) from the main bundle
3. WHEN the Platform loads the initial route, THE Bundle_Optimizer SHALL exclude PDF/Excel generation libraries (jspdf, exceljs) from the main bundle
4. WHEN a route requiring a heavy library is navigated to, THE Bundle_Optimizer SHALL dynamically import the library at that point
5. WHEN critical routes are identified (dashboard, login), THE Bundle_Optimizer SHALL preload their chunks via `<link rel="modulepreload">`

### Requirement 4: Scalable Data Access

**User Story:** As an institute admin with 50,000 students, I want data tables and search to remain responsive, so that I can manage my institution without UI freezes.

#### Acceptance Criteria

1. WHEN a data table displays more than 100 rows, THE Data_Table SHALL use virtual scrolling to render only visible rows
2. WHEN a user searches for students, THE Service_Layer SHALL perform server-side filtering via Supabase query parameters
3. WHEN paginated data is requested, THE Service_Layer SHALL use cursor-based or offset pagination with a configurable page size
4. WHEN the Query_Layer fetches a list endpoint, THE Query_Layer SHALL support infinite query patterns for progressive loading
5. IF a query returns more than 1000 results, THEN THE Service_Layer SHALL limit the response and indicate truncation to the client

### Requirement 5: Auth Hardening and Rate Limiting

**User Story:** As a platform operator, I want auth endpoints protected against brute-force attacks, so that student and teacher accounts remain secure at scale.

#### Acceptance Criteria

1. WHEN a login request is received, THE Auth_Guard SHALL enforce a rate limit of no more than 10 attempts per IP per minute
2. WHEN a registration request is received, THE Auth_Guard SHALL enforce a rate limit of no more than 5 attempts per IP per 10 minutes
3. WHEN a rate limit is exceeded, THE Auth_Guard SHALL respond with HTTP 429 and a `Retry-After` header
4. WHEN the Supabase client is initialized, THE Service_Layer SHALL validate that the client instance is non-null before proceeding
5. IF multiple auth requests arrive from the same session simultaneously, THEN THE Auth_Guard SHALL serialize them to prevent race conditions

### Requirement 6: Query and State Performance

**User Story:** As a teacher navigating between dashboards, I want transitions to feel instant, so that I can focus on teaching rather than waiting for data.

#### Acceptance Criteria

1. WHEN institute-level data is fetched, THE Query_Layer SHALL apply a staleTime of at least 300 seconds
2. WHEN a route transition occurs, THE Query_Layer SHALL prefetch the destination route's critical queries
3. WHEN a component unmounts and remounts within the staleTime window, THE Query_Layer SHALL serve cached data without a network request
4. WHEN Zustand stores hold derived data from server state, THE Platform SHALL ensure single-direction data flow (server → query → store)
5. WHEN the Platform renders the dashboard, THE Platform SHALL display a skeleton UI within 100 milliseconds of navigation start

