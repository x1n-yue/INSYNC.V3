import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // A test must explicitly replace this with a synthetic transport if needed.
  vi.stubGlobal("fetch", () => {
    throw new Error("Network disabled in local tests; provide a synthetic transport");
  });
});

afterEach(() => vi.unstubAllGlobals());
