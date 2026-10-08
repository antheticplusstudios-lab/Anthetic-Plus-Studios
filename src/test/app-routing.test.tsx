import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pricing.functions", () => ({
  getLivePricing: vi.fn().mockResolvedValue([]),
}));

import { routeTree } from "@/routeTree.gen";

function createTestRouter(path: string) {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App routing", () => {
  it("resolves the index route", async () => {
    const router = createTestRouter("/");

    await router.load();

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.matches.length).toBeGreaterThan(0);
  });

  it("resolves the not-found route", async () => {
    const router = createTestRouter("/this-route-does-not-exist");

    await router.load();

    expect(router.state.location.pathname).toBe("/this-route-does-not-exist");
    expect(router.state.matches.length).toBeGreaterThan(0);
  });
});
