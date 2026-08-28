import { describe, expect, it } from "vitest";

import {
  createInitialLifecycleState,
  transitionLifecycle,
  type DocumentObservedEvent,
} from "../../src/lifecycle/index.js";

describe("Blind Mode off lifecycle", () => {
  it("remains Inert and emits no commands for every route kind", () => {
    const observations: readonly DocumentObservedEvent[] = [
      {
        type: "document-observed",
        routeKind: "practice",
        occurredAtMs: 0,
      },
      {
        type: "document-observed",
        routeKind: "reference",
        occurredAtMs: 1_000,
      },
      {
        type: "document-observed",
        routeKind: "unsupported",
        occurredAtMs: 10_000,
      },
    ];
    let state = createInitialLifecycleState();

    const transitions = observations.map((event) => {
      const transition = transitionLifecycle(state, event);
      state = transition.state;
      return transition;
    });

    expect(transitions).toEqual([
      {
        state: { blindMode: "off", phase: "inert" },
        commands: [],
      },
      {
        state: { blindMode: "off", phase: "inert" },
        commands: [],
      },
      {
        state: { blindMode: "off", phase: "inert" },
        commands: [],
      },
    ]);
  });
});
