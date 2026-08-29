import { describe, expect, it } from "vitest";

import {
  createInitialLifecycleState,
  transitionLifecycle,
  type DocumentObservedEvent,
  type LifecycleEvent,
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
        state: { mode: { status: "off" }, attempt: { phase: "inert" } },
        commands: [],
      },
      {
        state: { mode: { status: "off" }, attempt: { phase: "inert" } },
        commands: [],
      },
      {
        state: { mode: { status: "off" }, attempt: { phase: "inert" } },
        commands: [],
      },
    ]);
  });

  it("publishes Blind Mode on only after the guarded runtime is installed", () => {
    const events: readonly LifecycleEvent[] = [
      { type: "enable-requested", operationId: 1 },
      {
        type: "mode-persisted",
        operationId: 1,
        value: "enabling",
      },
      { type: "guarded-runtime-installed", operationId: 1 },
      { type: "mode-persisted", operationId: 1, value: "on" },
    ];
    let state = createInitialLifecycleState();

    const transitions = events.map((event) => {
      const transition = transitionLifecycle(state, event);
      state = transition.state;
      return transition;
    });

    expect(transitions).toEqual([
      {
        state: {
          mode: {
            operationId: 1,
            stage: "persisting-enabling",
            status: "enabling",
          },
          attempt: { phase: "inert" },
        },
        commands: [
          { type: "persist-mode", operationId: 1, value: "enabling" },
        ],
      },
      {
        state: {
          mode: {
            operationId: 1,
            stage: "installing-runtime",
            status: "enabling",
          },
          attempt: { phase: "inert" },
        },
        commands: [{ type: "install-guarded-runtime", operationId: 1 }],
      },
      {
        state: {
          mode: {
            operationId: 1,
            stage: "publishing-on",
            status: "enabling",
          },
          attempt: { phase: "inert" },
        },
        commands: [{ type: "persist-mode", operationId: 1, value: "on" }],
      },
      {
        state: { mode: { status: "on" }, attempt: { phase: "inert" } },
        commands: [],
      },
    ]);
  });

  it("rolls a failed runtime installation back to off", () => {
    let state = createInitialLifecycleState();
    const run = (event: LifecycleEvent) => {
      const transition = transitionLifecycle(state, event);
      state = transition.state;
      return transition;
    };

    run({ type: "enable-requested", operationId: 7 });
    run({ type: "mode-persisted", operationId: 7, value: "enabling" });
    expect(run({ type: "guarded-runtime-installation-failed", operationId: 7 })).toMatchObject({
      state: { mode: { stage: "rolling-back" } },
      commands: [{ type: "rollback-guarded-runtime", operationId: 7 }],
    });
    expect(run({ type: "guarded-runtime-rollback-completed", operationId: 7 })).toMatchObject({
      state: { mode: { stage: "publishing-off" } },
      commands: [{ type: "persist-mode", operationId: 7, value: "off" }],
    });
    expect(run({ type: "mode-persisted", operationId: 7, value: "off" }).state).toEqual({
      mode: { status: "off" },
      attempt: { phase: "inert" },
    });
    expect(run({ type: "guarded-runtime-installed", operationId: 7 }).commands).toEqual([]);
  });
});
