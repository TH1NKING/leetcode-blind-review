import { describe, expect, it } from "vitest";

import {
  createInitialLifecycleState,
  transitionLifecycle,
  type LifecycleEvent,
  type LifecycleState,
} from "../../src/lifecycle/index.js";

function createEnabledState(): LifecycleState {
  let state = createInitialLifecycleState();
  const events: readonly LifecycleEvent[] = [
    { type: "enable-requested", operationId: 1 },
    { type: "mode-persisted", operationId: 1, value: "enabling" },
    { type: "guarded-runtime-installed", operationId: 1 },
    { type: "mode-persisted", operationId: 1, value: "on" },
  ];

  for (const event of events) {
    state = transitionLifecycle(state, event).state;
  }

  return state;
}

function createPreflightState(): LifecycleState {
  const ref = { documentId: "document-a", generation: 1 } as const;

  return transitionLifecycle(createEnabledState(), {
    type: "guarded-document-ready",
    authorizationId: "authorization-a",
    foreground: true,
    occurredAtMs: 100,
    ref,
    routeKind: "practice",
  }).state;
}

function createCountdownState(): LifecycleState {
  const ref = { documentId: "document-a", generation: 1 } as const;
  const inspection = transitionLifecycle(createPreflightState(), {
    type: "workspace-inspection-completed",
    candidateCount: 1,
    occurredAtMs: 150,
    ref,
  });

  return transitionLifecycle(inspection.state, {
    type: "workspace-guard-established",
    occurredAtMs: 200,
    ref,
  }).state;
}

describe("single-document Blind Attempt", () => {
  it("starts Guarded Preflight only for an already guarded foreground Practice View", () => {
    const state = createEnabledState();
    const ref = { documentId: "document-a", generation: 1 } as const;

    expect(
      transitionLifecycle(state, {
        type: "guarded-document-ready",
        authorizationId: "authorization-a",
        foreground: true,
        occurredAtMs: 100,
        ref,
        routeKind: "practice",
      }),
    ).toEqual({
      state: {
        mode: { status: "on" },
        attempt: {
          authorization: { id: "authorization-a", status: "available" },
          guard: "viewport",
          phase: "guarded-preflight",
          ref,
        },
      },
      commands: [{ type: "inspect-coding-workspace", ref }],
    });
  });

  it("starts the complete five-second window only after the Workspace Guard is established", () => {
    const ref = { documentId: "document-a", generation: 1 } as const;
    const inspection = transitionLifecycle(createPreflightState(), {
      type: "workspace-inspection-completed",
      candidateCount: 1,
      occurredAtMs: 150,
      ref,
    });

    expect(inspection).toMatchObject({
      state: {
        attempt: {
          guard: "viewport",
          phase: "establishing-workspace-guard",
        },
      },
      commands: [{ type: "establish-workspace-guard", ref }],
    });
    expect(
      transitionLifecycle(inspection.state, {
        type: "workspace-guard-established",
        occurredAtMs: 200,
        ref,
      }),
    ).toEqual({
      state: {
        mode: { status: "on" },
        attempt: {
          authorization: { id: "authorization-a", status: "available" },
          deadlineAtMs: 5_200,
          guard: "workspace",
          phase: "countdown",
          ref,
          startedAtMs: 200,
        },
      },
      commands: [
        { type: "schedule-countdown", deadlineAtMs: 5_200, ref },
      ],
    });
  });

  it.each([
    { candidateCount: 0, reason: "coding-workspace-missing" },
    { candidateCount: 2, reason: "coding-workspace-ambiguous" },
  ] as const)(
    "fails closed with the viewport Guard for $reason",
    ({ candidateCount, reason }) => {
      const ref = { documentId: "document-a", generation: 1 } as const;

      expect(
        transitionLifecycle(createPreflightState(), {
          type: "workspace-inspection-completed",
          candidateCount,
          occurredAtMs: 150,
          ref,
        }),
      ).toEqual({
        state: {
          mode: { status: "on" },
          attempt: {
            authorization: { id: "authorization-a", status: "revoked" },
            guard: "viewport",
            phase: "guarded-failure",
            reason,
            ref,
          },
        },
        commands: [{ type: "show-guarded-failure", reason, ref }],
      });
    },
  );

  it("transfers one Authorization only when the complete countdown elapses", () => {
    const ref = { documentId: "document-a", generation: 1 } as const;
    const early = transitionLifecycle(createCountdownState(), {
      type: "countdown-fired",
      occurredAtMs: 5_199,
      ref,
      scheduledForMs: 5_200,
    });

    expect(early.commands).toEqual([]);
    const elapsed = transitionLifecycle(early.state, {
      type: "countdown-fired",
      occurredAtMs: 5_200,
      ref,
      scheduledForMs: 5_200,
    });
    expect(elapsed).toMatchObject({
      state: {
        attempt: {
          authorization: { id: "authorization-a", status: "transferred" },
          phase: "reset-sequence-intent",
        },
      },
      commands: [
        {
          authorizationId: "authorization-a",
          ref,
          source: "countdown",
          type: "reset-sequence-intent",
        },
      ],
    });
    expect(
      transitionLifecycle(elapsed.state, {
        type: "countdown-fired",
        occurredAtMs: 5_201,
        ref,
        scheduledForMs: 5_200,
      }).commands,
    ).toEqual([]);
  });

  it.each(["enter", "button"] as const)(
    "lets the first %s request win over every duplicate trigger",
    (source) => {
      const ref = { documentId: "document-a", generation: 1 } as const;
      const requested = transitionLifecycle(createCountdownState(), {
        type: "reset-requested",
        ref,
        source,
      });

      expect(requested.commands).toEqual([
        {
          authorizationId: "authorization-a",
          ref,
          source,
          type: "reset-sequence-intent",
        },
      ]);
      const duplicateEvents: readonly LifecycleEvent[] = [
        { type: "reset-requested", ref, source: "enter" },
        { type: "reset-requested", ref, source: "button" },
        {
          type: "countdown-fired",
          occurredAtMs: 5_200,
          ref,
          scheduledForMs: 5_200,
        },
      ];
      let state = requested.state;

      for (const event of duplicateEvents) {
        const transition = transitionLifecycle(state, event);
        expect(transition.commands).toEqual([]);
        state = transition.state;
      }
    },
  );

  it("fails closed when the production reset sequence is unavailable", () => {
    const ref = { documentId: "document-a", generation: 1 } as const;
    const intent = transitionLifecycle(createCountdownState(), {
      type: "reset-requested",
      ref,
      source: "enter",
    });

    expect(
      transitionLifecycle(intent.state, {
        type: "reset-sequence-unavailable",
        authorizationId: "authorization-a",
        ref,
      }),
    ).toEqual({
      state: {
        mode: { status: "on" },
        attempt: {
          authorization: { id: "authorization-a", status: "revoked" },
          guard: "workspace",
          phase: "guarded-failure",
          reason: "reset-sequence-unavailable",
          ref,
        },
      },
      commands: [
        {
          reason: "reset-sequence-unavailable",
          ref,
          type: "show-guarded-failure",
        },
      ],
    });
  });

  it.each(["escape", "button"] as const)(
    "turns %s into a latched Bypassed Entry",
    (source) => {
      const ref = { documentId: "document-a", generation: 1 } as const;
      const bypassed = transitionLifecycle(createCountdownState(), {
        type: "bypass-requested",
        ref,
        source,
      });

      expect(bypassed).toEqual({
        state: {
          mode: { status: "on" },
          attempt: {
            authorization: { id: "authorization-a", status: "revoked" },
            guard: "none",
            phase: "bypassed-entry",
            ref,
          },
        },
        commands: [
          { type: "cancel-generation", ref },
          { type: "remove-editor-guard", ref },
        ],
      });
      const lateEvents: readonly LifecycleEvent[] = [
        {
          type: "workspace-inspection-completed",
          candidateCount: 1,
          occurredAtMs: 5_200,
          ref,
        },
        { type: "workspace-guard-established", occurredAtMs: 5_200, ref },
        {
          type: "countdown-fired",
          occurredAtMs: 5_200,
          ref,
          scheduledForMs: 5_200,
        },
        { type: "reset-requested", ref, source: "enter" },
        { type: "bypass-requested", ref, source: "escape" },
      ];

      for (const event of lateEvents) {
        expect(transitionLifecycle(bypassed.state, event)).toEqual({
          state: bypassed.state,
          commands: [],
        });
      }
    },
  );

  it("blocks new work before disabling the active guarded runtime", () => {
    const ref = { documentId: "document-a", generation: 1 } as const;
    const requested = transitionLifecycle(createCountdownState(), {
      type: "disable-requested",
      operationId: 2,
    });

    expect(requested).toMatchObject({
      state: {
        mode: {
          operationId: 2,
          stage: "persisting-disabling",
          status: "disabling",
        },
      },
      commands: [
        { type: "persist-mode", operationId: 2, value: "disabling" },
      ],
    });
    expect(
      transitionLifecycle(requested.state, {
        type: "countdown-fired",
        occurredAtMs: 5_200,
        ref,
        scheduledForMs: 5_200,
      }).commands,
    ).toEqual([]);
    const persisted = transitionLifecycle(requested.state, {
      type: "mode-persisted",
      operationId: 2,
      value: "disabling",
    });
    expect(persisted).toEqual({
      state: {
        mode: {
          operationId: 2,
          stage: "disabling-runtime",
          status: "disabling",
        },
        attempt: { phase: "inert" },
      },
      commands: [
        { type: "cancel-generation", ref },
        { type: "remove-editor-guard", ref },
        { type: "disable-guarded-runtime", operationId: 2 },
      ],
    });
    const disabled = transitionLifecycle(persisted.state, {
      type: "guarded-runtime-disabled",
      operationId: 2,
    });
    expect(disabled).toMatchObject({
      state: { mode: { stage: "publishing-off" } },
      commands: [{ type: "persist-mode", operationId: 2, value: "off" }],
    });
    expect(
      transitionLifecycle(disabled.state, {
        type: "mode-persisted",
        operationId: 2,
        value: "off",
      }),
    ).toEqual({
      state: { mode: { status: "off" }, attempt: { phase: "inert" } },
      commands: [],
    });
  });
});
