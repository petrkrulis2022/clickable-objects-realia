import { test } from "node:test";
import assert from "node:assert/strict";

// Runtime half of the mode-isolation test (see
// scripts/check-interview-isolation.mjs for the static half, which
// walks the actual import graph — this proves the running code
// doesn't call out either). A short real duration stands in for the
// SPEC's "run for 60 seconds" — the full 60s wall-clock version is a
// manual/live-browser item (docs/SPEC-SCREENVIEW.md, "Before real
// use"); what's worth asserting here is the mechanism, not the clock.

test("running interview mode calls no network or microphone API", async () => {
  let fetchCalls = 0;
  let wsConstructed = 0;
  let getUserMediaCalls = 0;

  const originalFetch = globalThis.fetch;
  const originalWebSocket = (globalThis as any).WebSocket;
  const originalNavigator = (globalThis as any).navigator;

  (globalThis as any).fetch = (...args: unknown[]) => {
    fetchCalls += 1;
    return originalFetch ? originalFetch(...(args as [any])) : Promise.reject(new Error("no fetch"));
  };
  (globalThis as any).WebSocket = class {
    constructor() {
      wsConstructed += 1;
    }
  };
  (globalThis as any).navigator = {
    mediaDevices: {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return {} as MediaStream;
      },
    },
  };
  (globalThis as any).chrome = {
    storage: { local: { get: async () => ({}) } },
  };

  try {
    const { runInterviewMode } = await import("./index");
    await runInterviewMode();
    await new Promise((r) => setTimeout(r, 200)); // give any stray async call a chance to fire

    assert.equal(fetchCalls, 0);
    assert.equal(wsConstructed, 0);
    assert.equal(getUserMediaCalls, 0);
  } finally {
    (globalThis as any).fetch = originalFetch;
    (globalThis as any).WebSocket = originalWebSocket;
    (globalThis as any).navigator = originalNavigator;
  }
});
