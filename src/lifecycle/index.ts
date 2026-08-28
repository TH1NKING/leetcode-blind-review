export type RouteKind = "practice" | "reference" | "unsupported";

export interface InertLifecycleState {
  readonly blindMode: "off";
  readonly phase: "inert";
}

export interface DocumentObservedEvent {
  readonly type: "document-observed";
  readonly routeKind: RouteKind;
  readonly occurredAtMs: number;
}

export type LifecycleCommand = never;

export interface LifecycleTransition {
  readonly state: InertLifecycleState;
  readonly commands: readonly LifecycleCommand[];
}

const NO_COMMANDS: readonly LifecycleCommand[] = Object.freeze([]);

export function createInitialLifecycleState(): InertLifecycleState {
  return { blindMode: "off", phase: "inert" };
}

export function transitionLifecycle(
  state: InertLifecycleState,
  _event: DocumentObservedEvent,
): LifecycleTransition {
  return { state, commands: NO_COMMANDS };
}
