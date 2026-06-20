import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { buildQueryClient } from "./lib/queryClient";

export const getRouter = () => {
  const queryClient = buildQueryClient();

  // The persister was disabled in the hotfix that consolidated IDB schemas.
  // We're investigating whether stale cross-user cache reads were affecting
  // login and exam scoring. The offline outbox (attendance + assignment
  // submissions) does not depend on the persister and continues to work.
  // To re-enable: import { attachPersister } from "./lib/queryClient" and
  // call attachPersister({ queryClient, userId: <auth user id> }) after
  // sign-in resolves.

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
    defaultPreload: "intent",
  });

  return router;
};
