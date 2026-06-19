import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { attachPersister, buildQueryClient } from "./lib/queryClient";

export const getRouter = () => {
  const queryClient = buildQueryClient();

  // Attach the persisted IndexedDB cache (browser only). User-id namespacing
  // is refreshed when AuthProvider hydrates the session — see
  // `src/components/AuthProvider.tsx` for the re-attach call.
  if (typeof window !== "undefined") {
    attachPersister({ queryClient, userId: null });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
    defaultPreload: "intent",
  });

  return router;
};
