export type RouteKind = "practice" | "reference" | "unsupported";

export type ModeState =
  | { readonly status: "off" }
  | {
      readonly status: "enabling";
      readonly operationId: number;
      readonly stage:
        | "persisting-enabling"
        | "installing-runtime"
        | "publishing-on"
        | "rolling-back"
        | "publishing-off";
    }
  | { readonly status: "on" }
  | {
      readonly status: "disabling";
      readonly operationId: number;
      readonly stage:
        | "persisting-disabling"
        | "disabling-runtime"
        | "publishing-off";
    };

export interface InertAttemptState {
  readonly phase: "inert";
}

export interface WorkflowRef {
  readonly documentId: string;
  readonly generation: number;
}

export interface GuardedPreflightAttemptState {
  readonly phase: "guarded-preflight";
  readonly ref: WorkflowRef;
  readonly guard: "viewport";
  readonly authorization: {
    readonly id: string;
    readonly status: "available";
  };
}

export interface EstablishingWorkspaceGuardAttemptState {
  readonly phase: "establishing-workspace-guard";
  readonly ref: WorkflowRef;
  readonly guard: "viewport";
  readonly authorization: {
    readonly id: string;
    readonly status: "available";
  };
}

export interface CountdownAttemptState {
  readonly phase: "countdown";
  readonly ref: WorkflowRef;
  readonly guard: "workspace";
  readonly authorization: {
    readonly id: string;
    readonly status: "available";
  };
  readonly startedAtMs: number;
  readonly deadlineAtMs: number;
}

export interface ResetSequenceIntentAttemptState {
  readonly phase: "reset-sequence-intent";
  readonly ref: WorkflowRef;
  readonly guard: "workspace";
  readonly authorization: {
    readonly id: string;
    readonly status: "transferred";
  };
}

export interface BypassedEntryAttemptState {
  readonly phase: "bypassed-entry";
  readonly ref: WorkflowRef;
  readonly guard: "none";
  readonly authorization: {
    readonly id: string;
    readonly status: "revoked";
  };
}

export type FailureReason =
  | "coding-workspace-missing"
  | "coding-workspace-ambiguous"
  | "reset-sequence-unavailable";

export interface GuardedFailureAttemptState {
  readonly phase: "guarded-failure";
  readonly ref: WorkflowRef;
  readonly guard: "viewport" | "workspace";
  readonly authorization: {
    readonly id: string;
    readonly status: "revoked";
  };
  readonly reason: FailureReason;
}

export type AttemptState =
  | InertAttemptState
  | GuardedPreflightAttemptState
  | EstablishingWorkspaceGuardAttemptState
  | CountdownAttemptState
  | ResetSequenceIntentAttemptState
  | BypassedEntryAttemptState
  | GuardedFailureAttemptState;

export interface LifecycleState {
  readonly mode: ModeState;
  readonly attempt: AttemptState;
}

export interface DocumentObservedEvent {
  readonly type: "document-observed";
  readonly routeKind: RouteKind;
  readonly occurredAtMs: number;
}

export interface EnableRequestedEvent {
  readonly type: "enable-requested";
  readonly operationId: number;
}

export interface ModePersistedEvent {
  readonly type: "mode-persisted";
  readonly operationId: number;
  readonly value: "enabling" | "on" | "disabling" | "off";
}

export interface GuardedRuntimeInstalledEvent {
  readonly type: "guarded-runtime-installed";
  readonly operationId: number;
}

export interface GuardedRuntimeInstallationFailedEvent {
  readonly type: "guarded-runtime-installation-failed";
  readonly operationId: number;
}

export interface GuardedRuntimeRollbackCompletedEvent {
  readonly type: "guarded-runtime-rollback-completed";
  readonly operationId: number;
}

export interface GuardedDocumentReadyEvent {
  readonly type: "guarded-document-ready";
  readonly ref: WorkflowRef;
  readonly authorizationId: string;
  readonly routeKind: RouteKind;
  readonly foreground: boolean;
  readonly occurredAtMs: number;
}

export interface WorkspaceInspectionCompletedEvent {
  readonly type: "workspace-inspection-completed";
  readonly ref: WorkflowRef;
  readonly candidateCount: number;
  readonly occurredAtMs: number;
}

export interface WorkspaceGuardEstablishedEvent {
  readonly type: "workspace-guard-established";
  readonly ref: WorkflowRef;
  readonly occurredAtMs: number;
}

export interface CountdownFiredEvent {
  readonly type: "countdown-fired";
  readonly ref: WorkflowRef;
  readonly scheduledForMs: number;
  readonly occurredAtMs: number;
}

export interface ResetRequestedEvent {
  readonly type: "reset-requested";
  readonly ref: WorkflowRef;
  readonly source: "button" | "enter";
}

export interface BypassRequestedEvent {
  readonly type: "bypass-requested";
  readonly ref: WorkflowRef;
  readonly source: "button" | "escape";
}

export interface DisableRequestedEvent {
  readonly type: "disable-requested";
  readonly operationId: number;
}

export interface GuardedRuntimeDisabledEvent {
  readonly type: "guarded-runtime-disabled";
  readonly operationId: number;
}

export interface ResetSequenceUnavailableEvent {
  readonly type: "reset-sequence-unavailable";
  readonly ref: WorkflowRef;
  readonly authorizationId: string;
}

export type LifecycleEvent =
  | DocumentObservedEvent
  | EnableRequestedEvent
  | ModePersistedEvent
  | GuardedRuntimeInstalledEvent
  | GuardedRuntimeInstallationFailedEvent
  | GuardedRuntimeRollbackCompletedEvent
  | GuardedDocumentReadyEvent
  | WorkspaceInspectionCompletedEvent
  | WorkspaceGuardEstablishedEvent
  | CountdownFiredEvent
  | ResetRequestedEvent
  | BypassRequestedEvent
  | DisableRequestedEvent
  | GuardedRuntimeDisabledEvent
  | ResetSequenceUnavailableEvent;

export type LifecycleCommand =
  | {
      readonly type: "persist-mode";
      readonly operationId: number;
      readonly value: "enabling" | "on" | "disabling" | "off";
    }
  | {
      readonly type: "install-guarded-runtime";
      readonly operationId: number;
    }
  | {
      readonly type: "rollback-guarded-runtime";
      readonly operationId: number;
    }
  | {
      readonly type: "inspect-coding-workspace";
      readonly ref: WorkflowRef;
    }
  | {
      readonly type: "establish-workspace-guard";
      readonly ref: WorkflowRef;
    }
  | {
      readonly type: "schedule-countdown";
      readonly ref: WorkflowRef;
      readonly deadlineAtMs: number;
    }
  | {
      readonly type: "show-guarded-failure";
      readonly ref: WorkflowRef;
      readonly reason: FailureReason;
    }
  | {
      readonly type: "reset-sequence-intent";
      readonly ref: WorkflowRef;
      readonly authorizationId: string;
      readonly source: "button" | "countdown" | "enter";
    }
  | {
      readonly type: "cancel-generation";
      readonly ref: WorkflowRef;
    }
  | {
      readonly type: "remove-editor-guard";
      readonly ref: WorkflowRef;
    }
  | {
      readonly type: "disable-guarded-runtime";
      readonly operationId: number;
    };

export interface LifecycleTransition {
  readonly state: LifecycleState;
  readonly commands: readonly LifecycleCommand[];
}

const NO_COMMANDS: readonly LifecycleCommand[] = Object.freeze([]);
const COUNTDOWN_DURATION_MS = 5_000;

function matchesWorkflowRef(left: WorkflowRef, right: WorkflowRef): boolean {
  return (
    left.documentId === right.documentId &&
    left.generation === right.generation
  );
}

export function createInitialLifecycleState(): LifecycleState {
  return { mode: { status: "off" }, attempt: { phase: "inert" } };
}

export function transitionLifecycle(
  state: LifecycleState,
  event: LifecycleEvent,
): LifecycleTransition {
  if (event.type === "enable-requested" && state.mode.status === "off") {
    return {
      state: {
        mode: {
          status: "enabling",
          operationId: event.operationId,
          stage: "persisting-enabling",
        },
        attempt: state.attempt,
      },
      commands: [
        {
          type: "persist-mode",
          operationId: event.operationId,
          value: "enabling",
        },
      ],
    };
  }

  if (
    event.type === "mode-persisted" &&
    event.value === "enabling" &&
    state.mode.status === "enabling" &&
    state.mode.stage === "persisting-enabling" &&
    event.operationId === state.mode.operationId
  ) {
    return {
      state: {
        mode: { ...state.mode, stage: "installing-runtime" },
        attempt: state.attempt,
      },
      commands: [
        {
          type: "install-guarded-runtime",
          operationId: event.operationId,
        },
      ],
    };
  }

  if (
    event.type === "disable-requested" &&
    state.mode.status !== "off" &&
    state.mode.status !== "disabling"
  ) {
    return {
      state: {
        mode: {
          status: "disabling",
          operationId: event.operationId,
          stage: "persisting-disabling",
        },
        attempt: state.attempt,
      },
      commands: [
        {
          type: "persist-mode",
          operationId: event.operationId,
          value: "disabling",
        },
      ],
    };
  }

  if (
    event.type === "mode-persisted" &&
    event.value === "disabling" &&
    state.mode.status === "disabling" &&
    state.mode.stage === "persisting-disabling" &&
    event.operationId === state.mode.operationId
  ) {
    const attemptCommands: LifecycleCommand[] = [];

    if (state.attempt.phase !== "inert") {
      attemptCommands.push(
        { type: "cancel-generation", ref: state.attempt.ref },
        { type: "remove-editor-guard", ref: state.attempt.ref },
      );
    }

    return {
      state: {
        mode: { ...state.mode, stage: "disabling-runtime" },
        attempt: { phase: "inert" },
      },
      commands: [
        ...attemptCommands,
        {
          type: "disable-guarded-runtime",
          operationId: event.operationId,
        },
      ],
    };
  }

  if (
    event.type === "guarded-runtime-disabled" &&
    state.mode.status === "disabling" &&
    state.mode.stage === "disabling-runtime" &&
    event.operationId === state.mode.operationId
  ) {
    return {
      state: {
        mode: { ...state.mode, stage: "publishing-off" },
        attempt: state.attempt,
      },
      commands: [
        { type: "persist-mode", operationId: event.operationId, value: "off" },
      ],
    };
  }

  if (
    event.type === "guarded-runtime-installed" &&
    state.mode.status === "enabling" &&
    state.mode.stage === "installing-runtime" &&
    event.operationId === state.mode.operationId
  ) {
    return {
      state: {
        mode: { ...state.mode, stage: "publishing-on" },
        attempt: state.attempt,
      },
      commands: [
        {
          type: "persist-mode",
          operationId: event.operationId,
          value: "on",
        },
      ],
    };
  }

  if (
    event.type === "guarded-runtime-installation-failed" &&
    state.mode.status === "enabling" &&
    state.mode.stage === "installing-runtime" &&
    event.operationId === state.mode.operationId
  ) {
    return {
      state: {
        mode: { ...state.mode, stage: "rolling-back" },
        attempt: state.attempt,
      },
      commands: [
        { type: "rollback-guarded-runtime", operationId: event.operationId },
      ],
    };
  }

  if (
    event.type === "guarded-runtime-rollback-completed" &&
    state.mode.status === "enabling" &&
    state.mode.stage === "rolling-back" &&
    event.operationId === state.mode.operationId
  ) {
    return {
      state: {
        mode: { ...state.mode, stage: "publishing-off" },
        attempt: state.attempt,
      },
      commands: [
        { type: "persist-mode", operationId: event.operationId, value: "off" },
      ],
    };
  }

  if (
    event.type === "mode-persisted" &&
    event.value === "on" &&
    state.mode.status === "enabling" &&
    state.mode.stage === "publishing-on" &&
    event.operationId === state.mode.operationId
  ) {
    return {
      state: { mode: { status: "on" }, attempt: state.attempt },
      commands: NO_COMMANDS,
    };
  }

  if (
    event.type === "mode-persisted" &&
    event.value === "off" &&
    (state.mode.status === "enabling" ||
      state.mode.status === "disabling") &&
    state.mode.stage === "publishing-off" &&
    event.operationId === state.mode.operationId
  ) {
    return {
      state: { mode: { status: "off" }, attempt: { phase: "inert" } },
      commands: NO_COMMANDS,
    };
  }

  if (
    event.type === "guarded-document-ready" &&
    state.mode.status === "on" &&
    state.attempt.phase === "inert" &&
    event.routeKind === "practice" &&
    event.foreground
  ) {
    return {
      state: {
        mode: state.mode,
        attempt: {
          phase: "guarded-preflight",
          ref: event.ref,
          guard: "viewport",
          authorization: {
            id: event.authorizationId,
            status: "available",
          },
        },
      },
      commands: [{ type: "inspect-coding-workspace", ref: event.ref }],
    };
  }

  if (
    event.type === "workspace-inspection-completed" &&
    event.candidateCount === 1 &&
    state.mode.status === "on" &&
    state.attempt.phase === "guarded-preflight" &&
    matchesWorkflowRef(event.ref, state.attempt.ref)
  ) {
    return {
      state: {
        mode: state.mode,
        attempt: {
          ...state.attempt,
          phase: "establishing-workspace-guard",
        },
      },
      commands: [{ type: "establish-workspace-guard", ref: event.ref }],
    };
  }

  if (
    event.type === "workspace-inspection-completed" &&
    event.candidateCount !== 1 &&
    state.mode.status === "on" &&
    state.attempt.phase === "guarded-preflight" &&
    matchesWorkflowRef(event.ref, state.attempt.ref)
  ) {
    const reason: FailureReason =
      event.candidateCount === 0
        ? "coding-workspace-missing"
        : "coding-workspace-ambiguous";

    return {
      state: {
        mode: state.mode,
        attempt: {
          ...state.attempt,
          phase: "guarded-failure",
          authorization: {
            ...state.attempt.authorization,
            status: "revoked",
          },
          reason,
        },
      },
      commands: [{ type: "show-guarded-failure", ref: event.ref, reason }],
    };
  }

  if (
    event.type === "workspace-guard-established" &&
    state.mode.status === "on" &&
    state.attempt.phase === "establishing-workspace-guard" &&
    matchesWorkflowRef(event.ref, state.attempt.ref)
  ) {
    const deadlineAtMs = event.occurredAtMs + COUNTDOWN_DURATION_MS;

    return {
      state: {
        mode: state.mode,
        attempt: {
          ...state.attempt,
          phase: "countdown",
          guard: "workspace",
          startedAtMs: event.occurredAtMs,
          deadlineAtMs,
        },
      },
      commands: [
        { type: "schedule-countdown", ref: event.ref, deadlineAtMs },
      ],
    };
  }

  if (
    event.type === "countdown-fired" &&
    state.mode.status === "on" &&
    state.attempt.phase === "countdown" &&
    matchesWorkflowRef(event.ref, state.attempt.ref) &&
    event.scheduledForMs === state.attempt.deadlineAtMs &&
    event.occurredAtMs >= state.attempt.deadlineAtMs
  ) {
    return {
      state: {
        mode: state.mode,
        attempt: {
          phase: "reset-sequence-intent",
          ref: state.attempt.ref,
          guard: "workspace",
          authorization: {
            id: state.attempt.authorization.id,
            status: "transferred",
          },
        },
      },
      commands: [
        {
          type: "reset-sequence-intent",
          ref: event.ref,
          authorizationId: state.attempt.authorization.id,
          source: "countdown",
        },
      ],
    };
  }

  if (
    event.type === "reset-requested" &&
    state.mode.status === "on" &&
    state.attempt.phase === "countdown" &&
    matchesWorkflowRef(event.ref, state.attempt.ref)
  ) {
    return {
      state: {
        mode: state.mode,
        attempt: {
          phase: "reset-sequence-intent",
          ref: state.attempt.ref,
          guard: "workspace",
          authorization: {
            id: state.attempt.authorization.id,
            status: "transferred",
          },
        },
      },
      commands: [
        {
          type: "reset-sequence-intent",
          ref: event.ref,
          authorizationId: state.attempt.authorization.id,
          source: event.source,
        },
      ],
    };
  }

  if (
    event.type === "bypass-requested" &&
    state.mode.status === "on" &&
    state.attempt.phase === "countdown" &&
    matchesWorkflowRef(event.ref, state.attempt.ref)
  ) {
    return {
      state: {
        mode: state.mode,
        attempt: {
          phase: "bypassed-entry",
          ref: state.attempt.ref,
          guard: "none",
          authorization: {
            id: state.attempt.authorization.id,
            status: "revoked",
          },
        },
      },
      commands: [
        { type: "cancel-generation", ref: event.ref },
        { type: "remove-editor-guard", ref: event.ref },
      ],
    };
  }

  if (
    event.type === "reset-sequence-unavailable" &&
    state.mode.status === "on" &&
    state.attempt.phase === "reset-sequence-intent" &&
    matchesWorkflowRef(event.ref, state.attempt.ref) &&
    event.authorizationId === state.attempt.authorization.id
  ) {
    return {
      state: {
        mode: state.mode,
        attempt: {
          phase: "guarded-failure",
          ref: state.attempt.ref,
          guard: "workspace",
          authorization: {
            id: state.attempt.authorization.id,
            status: "revoked",
          },
          reason: "reset-sequence-unavailable",
        },
      },
      commands: [
        {
          type: "show-guarded-failure",
          ref: event.ref,
          reason: "reset-sequence-unavailable",
        },
      ],
    };
  }

  return { state, commands: NO_COMMANDS };
}
